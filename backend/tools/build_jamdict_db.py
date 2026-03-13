#!/usr/bin/env python3
"""
Build the jamdict SQLite database from JMdict_e XML.

Run once locally before building the Docker image:
    cd backend
    python tools/build_jamdict_db.py

Download JMdict_e first:
    cd backend/data
    curl -O https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
    gunzip JMdict_e.gz

Input:  data/JMdict_e
Output: data/jamdict.db
"""

import sys
from pathlib import Path

from jamdict import Jamdict

DATA_DIR = Path(__file__).parent.parent / "data"
INPUT_FILE = DATA_DIR / "JMdict_e"
OUTPUT_DB = DATA_DIR / "jamdict.db"


def build(input_path: Path, db_path: Path) -> None:
    if db_path.exists():
        db_path.unlink()

    # Pre-create the file so jamdict does not fall back to the bundled jamdict-data DB.
    db_path.touch()

    print(f"Importing {input_path} ...")
    jam = Jamdict(db_file=str(db_path), jmd_xml_file=str(input_path), auto_config=False)
    jam.import_data()

    size_mb = db_path.stat().st_size / 1024 / 1024
    print(f"Done. Output: {db_path}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    if not INPUT_FILE.exists():
        print(f"Error: input file not found: {INPUT_FILE}", file=sys.stderr)
        print("Download it first:", file=sys.stderr)
        print("  cd backend/data", file=sys.stderr)
        print("  curl -O https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz", file=sys.stderr)
        print("  gunzip JMdict_e.gz", file=sys.stderr)
        sys.exit(1)

    print(f"Input:  {INPUT_FILE}")
    print(f"Output: {OUTPUT_DB}")
    print()
    build(INPUT_FILE, OUTPUT_DB)
