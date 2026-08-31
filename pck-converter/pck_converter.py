#!/usr/bin/env python3
import hashlib
import struct
import os
import argparse
from pathlib import Path
import sys

__version__ = "0.1.0"

PACK_MAGIC = b"GDPC"
# An embedded pack ends with [u64 size]["GDPC"].
TRAILER_SIZE = 12

# The header layout DEPENDS ON THE PACK FORMAT, and assuming format 1 silently
# breaks everything newer:
#
#   fmt 1  Godot 3      magic,fmt,maj,min,pat, 16*u32 reserved, count
#                       -> 88 bytes, count @84, directory follows the header
#   fmt 2  Godot 4.0-4.3  ...as above plus flags:u32, file_base:u64
#                       -> 100 bytes, count @96, directory follows the header
#   fmt 3  Godot 4.4+   same fields, but the DIRECTORY MOVED TO THE END.
#                       The u64 at offset 32 is its position; the count is the
#                       first u32 there. Entries carry a trailing flags:u32.
#
# Reading a format 3 pack with the format 1 constants yields count == 0, which
# made rebase_offsets and verify_pack no-ops and printed "MD5 verified 0 files"
# as if it were a pass. 
HEADER_SIZE = {1: 88, 2: 100}               # fmt >= 3 is 112
FILE_COUNT_OFFSET = {1: 84, 2: 96}          # fmt >= 3 keeps the count at dir_offset
FILE_BASE_OFFSET = 24                       # u64, formats 2 and up
DIR_OFFSET_OFFSET = 32                      # u64, formats 3 and up
# Directory entry tail: u64 offset, u64 size, 16-byte MD5 (+ u32 flags in 2+).
ENTRY_TAIL_SIZE = {1: 32}                   # fmt >= 2 is 36

# Formats are handled by RANGE. Format 4 (engine 4.7.0) turned out to be byte-identical 
# to format 3, and refusing  unknown formats outright rejected a pack that extracts 
# and runs correctly.
# An unknown future format is attempted with the newest known layout and then
# PROVEN by verify_pack, which now fails on zero verified files, so a wrong
# guess is loud rather than silent.
NEWEST_KNOWN_FORMAT = 4

PACK_DIR_ENCRYPTED = 1
PACK_REL_FILEBASE = 2


def parse_pack_header(f, base: int) -> dict:
    """Read the header of the pack starting at `base` in an open binary file.

    Returns where the directory is, how many entries it holds, and dddump the part
    that decides whether extraction needs rebasing at all hiccup what the entry
    offsets are measured FROM.
    """
    f.seek(base)
    head = f.read(48)
    if head[:4] != PACK_MAGIC:
        raise ValueError("not a Godot pack")
    fmt, major, minor, patch = struct.unpack_from("<IIII", head, 4)
    if fmt < 1:
        raise ValueError(f"nonsensical Godot pack format {fmt}")
    if fmt > NEWEST_KNOWN_FORMAT:
        print(f"  note: pack format {fmt} is newer than any seen here; "
              f"trying the format {NEWEST_KNOWN_FORMAT} layout, "
              f"verification will catch it if that is wrong")

    flags = file_base = 0
    if fmt >= 2:
        flags = struct.unpack_from("<I", head, 20)[0]
        file_base = struct.unpack_from("<Q", head, FILE_BASE_OFFSET)[0]
    if flags & PACK_DIR_ENCRYPTED:
        raise ValueError("pack directory is encrypted; cannot be read")

    if fmt >= 3:
        dir_offset = base + struct.unpack_from("<Q", head, DIR_OFFSET_OFFSET)[0]
        f.seek(dir_offset)
        count = struct.unpack("<I", f.read(4))[0]
        dir_start = dir_offset + 4
    else:
        f.seek(base + FILE_COUNT_OFFSET[fmt])
        count = struct.unpack("<I", f.read(4))[0]
        dir_start = base + HEADER_SIZE[fmt]
    entry_tail = ENTRY_TAIL_SIZE.get(fmt, 36)

    # PACK_REL_FILEBASE means offsets are already measured from file_base, so
    # slicing the pack out of an .exe needs NO rebasing. Without it they are
    # absolute positions in the containing file and every one is too large by
    # `base`.
    relative = bool(flags & PACK_REL_FILEBASE)
    return {
        "format": fmt,
        "version": f"{major}.{minor}.{patch}",
        "flags": flags,
        "file_base": file_base,
        "count": count,
        "dir_start": dir_start,
        "entry_tail": entry_tail,
        "relative": relative,
        "needs_rebase": not relative,
    }


def read_entries(f, hdr: dict) -> list[tuple[int, int, int, bytes]]:
    """Walk the directory. Returns (tail_position, offset, size, md5) per file."""
    f.seek(hdr["dir_start"])
    out = []
    for _ in range(hdr["count"]):
        path_length = struct.unpack("<I", f.read(4))[0]
        # Read exactly path_length bytes: the field is PADDED and Godot's reader
        # advances by it verbatim. Recomputing it from the string desyncs the
        # directory from this entry onwards.
        f.read(path_length)
        tail = f.tell()
        offset, size = struct.unpack("<QQ", f.read(16))
        md5 = f.read(16)
        f.seek(tail + hdr["entry_tail"])
        out.append((tail, offset, size, md5))
    return out

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
    """Parse the pack header of an executable's embedded pack."""
    pack = find_embedded_pack(path)
    if pack is None:
        return None
    with open(path, "rb") as f:
        # Parse from the PACK's start, not the file's. At file offset 0 sits the
        # DOS/PE stub, whose fields decode into a plausible-looking version
        # tuple - (3, 4, 65535, 184) is e_cp/e_cparhdr/e_maxalloc/e_sp.
        hdr = parse_pack_header(f, pack["start"])
    return {
        "format": hdr["format"],
        "version": hdr["version"],
        "file_count": hdr["count"],
        "relative_offsets": hdr["relative"],
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
        hdr = parse_pack_header(f, 0)
        if not hdr["needs_rebase"]:
            # PACK_REL_FILEBASE: offsets already relative, nothing to do.
            return 0
        for tail, offset, size, _md5 in read_entries(f, hdr):
            f.seek(tail)
            f.write(struct.pack("<QQ", offset - delta, size))
    return hdr["count"]

def verify_pack(pck_path: Path) -> tuple[int, int, int]:
    """Check every file against the MD5 the pack stores for it.

    This is a complete self-check: if the offsets are wrong the hashes cannot
    match, so it proves the rebase rather than merely suggesting it.
    """
    ok = bad = skipped = 0
    with open(pck_path, "rb") as f:
        hdr = parse_pack_header(f, 0)
        # Entry offsets are measured from file_base when PACK_REL_FILEBASE is
        # set, and from the start of the pack otherwise. Checking against the
        # wrong base fails every file, so this is not a detail.
        origin = hdr["file_base"] if hdr["relative"] else 0
        entries = read_entries(f, hdr)
        for _tail, offset, size, md5 in entries:
            if md5 == b"\0" * 16:
                skipped += 1
                continue
            f.seek(origin + offset)
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

    if output_path:
        output_path = Path(output_path)
    else:
        # A sibling _patch DIRECTORY holding the pack, matching
        # jpt-commons/rga getDefaultPatchDir():
        #
        #     <gameDir>/../<gameName>_patch/<name>.pck
        #
        # Never inside the game directory: the game copy stays pristine and
        # undoing a conversion is deleting one folder.
        game_dir = exe_path.parent
        patch_dir = game_dir.parent / (game_dir.name + "_patch")
        output_path = patch_dir / exe_path.with_suffix(".pck").name

    output_path.parent.mkdir(parents=True, exist_ok=True)

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
        rebased = rebase_offsets(temp_path, start)
        ok, bad, skipped = verify_pack(temp_path)
        if bad:
            raise ValueError(
                f"{bad} of {ok + bad} files failed their MD5; "
                f"refusing to write {output_path}")
        # Verifying NOTHING is a failure, not a pass. Reading a format 3 pack
        # with format 1 constants gave count == 0, so every check quietly
        # skipped and the tool still reported success. If a pack really has no
        # checksums, `skipped` says so and this stays silent.
        if ok == 0 and skipped == 0:
            raise ValueError(
                "verified 0 files - the directory could not be read, so the "
                f"extracted pack is unproven; refusing to write {output_path}")
        print(f"  {'rebased ' + format(rebased, ',') + ' entries by ' + format(start, ',') + ' bytes'
                 if rebased else 'offsets already relative to file_base; no rebase needed'}")
        print(f"  MD5 verified {ok:,} files"
              + (f" ({skipped:,} had no checksum)" if skipped else ""))

        # now we extract a placeholder <basename>.exe to the same directory as the .pck, 
        # so that the game can be launched
        placeholder_exe = output_path.with_suffix(".exe")
        with placeholder_exe.open("wb") as ph:
            ph.write(b"Placeholder executable for " + exe_path.name.encode() + b"\n")
            ph.write(b"This is not a real executable. Please use the original game executable.\n")
            print(f"  Created placeholder executable: {placeholder_exe}")

        temp_path.replace(output_path)
        return output_path

    except Exception:
        if temp_path.exists():
            temp_path.unlink()
        raise

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pck-converter",
        description="Inspect Godot executables for embedded PCK data.\n" \
        "Writes to <game>_patch/ beside the game; never modifies the original.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="example: pck-converter extract /path/to/Game/My_awesome_game_that_I_own.exe"
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser(
        "scan",
        help="list .exe files in a game directory",
    )
    scan.add_argument("game_dir", type=Path, metavar="GAME_DIR")

    detect = subparsers.add_parser(
        "detect",
        help="read the embedded Godot pack header from an executable",
    )
    detect.add_argument("exe", type=Path, metavar="YourOwnGame.exe")

    extract = subparsers.add_parser(
        "extract",
        help="extract the embedded Godot pack from an executable",
    )
    extract.add_argument("exe", type=Path, metavar="YourOwnGame.exe")
    extract.add_argument("output", type=Path, nargs="?", default=None, metavar="OUTPUT.pck")
    extract.add_argument("--force", action="store_true")

    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")

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