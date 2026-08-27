import hashlib
import struct
import os
import argparse
from pathlib import Path
import sys

PACK_MAGIC = b"GDPC"
# "GDPC", format, major, minor, patch, 16 reserved u32, file_count -> 88 bytes.
HEADER_SIZE = 88
FILE_COUNT_OFFSET = 84
# An embedded pack ends with [u64 size]["GDPC"].
TRAILER_SIZE = 12
# Directory entry tail: u64 offset, u64 size, 16-byte MD5.
ENTRY_TAIL_SIZE = 32

def find_executables(game_dir: str) -> list[str] | None:
    try:
        list_of_files = [file for file in os.listdir(game_dir) if file.endswith(".exe")]
        if list_of_files:
            return list_of_files
    except Exception as e:
        return None

def find_embedded_pack(exe_path: Path) -> dict | None:
    """Locate the pack appended to a Godot self-contained executable."""
    try:
        file_size = exe_path.stat().st_size
        if file_size < TRAILER_SIZE:
            return None
        with open(exe_path, "rb") as f:
            f.seek(-4, 2)
            if f.read(4) != PACK_MAGIC:
                return None
            f.seek(-TRAILER_SIZE, 2)
            # The size is a u64. Reading only 4 bytes happens to work while the
            # pack is under 4 GiB and the high word is zero, so the truncation
            # stays invisible until it silently isn't.
            size = struct.unpack("<Q", f.read(8))[0]
            start = file_size - TRAILER_SIZE - size
            if start < 0:
                return None
            # Godot checks the magic at the computed start as well; if it is not
            # there the trailer lied and nothing after this point is meaningful.
            f.seek(start)
            if f.read(4) != PACK_MAGIC:
                return None
            return {"start": start, "size": size}
    except Exception as e:
        raise ValueError(f"Failed to find embedded pack: {e}")

def read_pack_header(path: Path) -> dict | None:
    """Parse the 88-byte pack header of an executable's embedded pack."""
    pack = find_embedded_pack(path)
    if pack is None:
        return None
    with open(path, "rb") as f:
        f.seek(pack["start"])
        header = f.read(HEADER_SIZE)
    if len(header) < HEADER_SIZE:
        return None
    # Read the header from the PACK's start, not the file's. At file offset 0
    # sits the DOS/PE stub, whose fields decode into a plausible-looking
    # version tuple - (3, 4, 65535, 184) is e_cp/e_cparhdr/e_maxalloc/e_sp.
    _magic, format, major, minor, patch = struct.unpack_from("<IIIII", header, 0)
    return {
        "format": format,
        "version": f"{major}.{minor}.{patch}",
        "file_count": struct.unpack_from("<I", header, FILE_COUNT_OFFSET)[0],
        **pack,
    }

def rebase_offsets(pck_path: Path, delta: int) -> int:
    """Subtract `delta` from every file offset in an extracted pack.

    An embedded pack's directory stores offsets as absolute positions in the
    .exe, because that is where Godot reads them from. Slicing the pack out
    moves the data to a new base of 0 but leaves the directory pointing into
    the original executable, so every entry is too large by the pack's start
    offset and most land past EOF. The bytes are fine; only the index is wrong.
    """
    with open(pck_path, "r+b") as f:
        header = f.read(HEADER_SIZE)
        count = struct.unpack_from("<I", header, FILE_COUNT_OFFSET)[0]
        for _ in range(count):
            path_length = struct.unpack("<I", f.read(4))[0]
            # Read exactly path_length bytes: the field is PADDED, and Godot's
            # reader advances by it verbatim. Recomputing it from the string
            # desyncs the directory from this entry onwards.
            f.read(path_length)
            tail = f.tell()
            offset, size = struct.unpack("<QQ", f.read(16))
            f.seek(tail)
            f.write(struct.pack("<QQ", offset - delta, size))
            f.seek(tail + ENTRY_TAIL_SIZE)
    return count

def verify_pack(pck_path: Path) -> tuple[int, int, int]:
    """Check every file against the MD5 the pack stores for it.

    This is a complete self-check: if the offsets are wrong the hashes cannot
    match, so it proves the rebase rather than merely suggesting it.
    """
    ok = bad = skipped = 0
    with open(pck_path, "rb") as f:
        header = f.read(HEADER_SIZE)
        count = struct.unpack_from("<I", header, FILE_COUNT_OFFSET)[0]
        entries = []
        for _ in range(count):
            path_length = struct.unpack("<I", f.read(4))[0]
            f.read(path_length)
            offset, size = struct.unpack("<QQ", f.read(16))
            entries.append((offset, size, f.read(16)))
        for offset, size, md5 in entries:
            if md5 == b"\0" * 16:
                skipped += 1
                continue
            f.seek(offset)
            if hashlib.md5(f.read(size)).digest() == md5:
                ok += 1
            else:
                bad += 1
    return ok, bad, skipped

def extract(exe_path: str | Path, output_path: str | Path | None = None, force: bool = False) -> Path:
    exe_path = Path(exe_path)
    pack = find_embedded_pack(exe_path)

    if pack is None:
        raise ValueError("no embedded Godot pack found")

    output_path = Path(output_path) if output_path else exe_path.with_suffix(".pck")

    if output_path.exists() and not force:
        raise FileExistsError(f"output already exists: {output_path}")

    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")

    start = pack["start"]
    remaining = pack["size"]
    chunk_size = 1024 * 1024 # 1MB at a time

    try:
        with exe_path.open("rb") as src, temp_path.open("wb") as dst:
            src.seek(start)

            while remaining > 0:
                data = src.read(min(chunk_size, remaining))
                if not data:
                    raise IOError("You're early. I've missed ya.")

                dst.write(data)
                remaining -= len(data)

        # Copying the bytes is only half the job, without this the pack looks
        # structurally valid and fails at load, because every offset still
        # points into the .exe.
        rebase_offsets(temp_path, start)
        ok, bad, skipped = verify_pack(temp_path)
        if bad:
            raise ValueError(
                f"{bad} of {ok + bad} files failed their MD5 after rebasing; "
                f"refusing to write {output_path}")
        print(f"  rebased by {start:,} bytes; MD5 verified {ok:,} files"
              + (f" ({skipped:,} had no checksum)" if skipped else ""))

        temp_path.replace(output_path)
        return output_path

    except Exception:
        if temp_path.exists():
            temp_path.unlink()
        raise

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pck-converter",
        description="Inspect Godot executables for embedded PCK data.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser(
        "scan",
        help="list .exe files in a game directory",
    )
    scan.add_argument("game_dir", type=Path)

    detect = subparsers.add_parser(
        "detect",
        help="read the embedded Godot pack header from an executable",
    )
    detect.add_argument("exe", type=Path)

    extract = subparsers.add_parser(
        "extract",
        help="extract the embedded Godot pack from an executable",
    )
    extract.add_argument("exe", type=Path)
    extract.add_argument("output", type=Path, nargs="?", default=None)
    extract.add_argument("--force", action="store_true")

    return parser

def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    
    try:
        if args.command == "scan":
            executables = find_executables(args.game_dir)
            if not executables:
                print("No executables found.")
                return 1

            print("Found executables:")
            for exe in executables:
                print(f"  {exe}")
            return 0

        if args.command == "detect":
            if not args.exe.is_file():
                print("Invalid path to the executable.")
                return 1
            if not args.exe.suffix == ".exe":
                print("The specified file is not a .exe file.")
                return 1
            header = read_pack_header(args.exe)
            if header is None:
                print("No embedded Godot pack header found.")
                return 1
            print(f"Godot pack detected: {header['version']}, format {header['format']}")
            print(f"  files : {header['file_count']:,}")
            print(f"  start : {header['start']:,}")
            print(f"  size  : {header['size']:,}")
            return 0

        if args.command == "extract":
            if not args.exe.is_file():
                print("Invalid path to the executable.")
                return 1
            if not args.exe.suffix == ".exe":
                print("The specified file is not a .exe file.")
                return 1
            try:
                output_path = extract(args.exe, args.output, args.force)
                print(f"Extracted Godot pack to: {output_path}")
                return 0
            except FileExistsError as e:
                print(e)
                return 1
            except ValueError as e:
                print(e)
                return 1

        parser.error(f"unknown command: {args.command}")
        return 2

    except (OSError, ValueError, struct.error) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

if __name__ == "__main__":
   raise SystemExit(main())