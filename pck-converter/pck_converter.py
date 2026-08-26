import struct
import os
import argparse
from pathlib import Path
import sys

def find_executables(game_dir: str) -> list[str] | None:
    try:
        list_of_files = [file for file in os.listdir(game_dir) if file.endswith(".exe")]
        if list_of_files:
            return list_of_files
    except Exception as e:
        return None

def read_pack_header(path: Path) -> dict | None:
    try:
        with open(path, "rb") as f:
            last_four_bytes = f.read()[-4:] 
            # If last_four_bytes is not b"GDPC", return None
            if last_four_bytes != b"GDPC":
                return None
            # If it is, exe is the embedded pack
            # Jump to EOF-12
            f.seek(-12, 2)
            # jump to EOF-12-size
            size_bytes = f.read(4)
            size = struct.unpack("<I", size_bytes)[0]
            f.seek(-12-size, 2)
            header = f.read(size)

            rawbytes_to_numbers = struct.unpack_from("<IIII", header, 4)
            
    except Exception as e:
        return None
    # {major}.{minor}.{patch}
    format, major, minor, patch = rawbytes_to_numbers
    return f"{major}.{minor}.{patch}, format {format}"

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

            print(f"Godot pack detected: {header}")
            return 0

        parser.error(f"unknown command: {args.command}")
        return 2

    except (OSError, ValueError, struct.error) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

if __name__ == "__main__":
   raise SystemExit(main())