"""Download the NASA C-MAPSS files and check they are the exact files the results were made with.

``python -m aeromro.data.download --dest data/raw/CMAPSSData``
``python -m aeromro.data.download --dest data/raw/CMAPSSData --from-zip CMAPSSData.zip``

Checksums are computed on the content with line endings normalised to ``\\n``, so a copy saved
with Windows line endings is still recognised; any other change to a value is detected.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import urllib.request
import zipfile
from collections.abc import Iterator
from pathlib import Path

NASA_URL = "https://data.nasa.gov/docs/legacy/CMAPSSData.zip"

# SHA-256 of each file after normalising line endings to "\n".
CHECKSUMS = {
    "RUL_FD001.txt": "a19c8ec94931949d0485bdc35118206e9c81c4547b422efb9cf86f4ceddbceca",
    "RUL_FD002.txt": "c851dd96a6ea6998d3c4a8f834d3c8013aa90e93a6ed950dc826ad0655b2906b",
    "RUL_FD003.txt": "df1e0566306b174a2de41c67a3e7a51877889598b78643fc3e5685259091b7cb",
    "RUL_FD004.txt": "196b836b85a95ac7fdbbf29c5fdf1657382eafa445644d114ffaaf50dc2975e1",
    "test_FD001.txt": "3cda7109ce17bafb5443f2ac926cfcf88154b941b8c4cf95eb55d1ddd6f52851",
    "test_FD002.txt": "de7b5bf7e998a985c378488480528b7c02cff1406a46740def362dda8d9b4e02",
    "test_FD003.txt": "299babd63c8d987cef079c4a425429f33b3a34797d803bbe2ad48c29dbd0d790",
    "test_FD004.txt": "1dc675fff0624bac10786927c6715b37d1297657137400d2b1a3138d777a3ba5",
    "train_FD001.txt": "963b5e22825b34d8b21c69e1aeb4af3e647050eb672ee8834ba4b5d91d2de0f8",
    "train_FD002.txt": "dac6c4dbc4e7c1bdeb5747da3d313d05c395bb99801b44a002b26a2ba13d788f",
    "train_FD003.txt": "2abbe9968cc5e8eb091980f51b20f62bb4127336d3482cb52071d53bf23329e2",
    "train_FD004.txt": "27ef6160b6a1dcb2613a88de9c239f763b223f02cdc41dc5cdedc5dc189b6218",
}

# Engines per file, as found in the files (the official readme swaps FD004's 248 and 249).
EXPECTED_ENGINES = {
    "train_FD001.txt": 100, "test_FD001.txt": 100,
    "train_FD002.txt": 260, "test_FD002.txt": 259,
    "train_FD003.txt": 100, "test_FD003.txt": 100,
    "train_FD004.txt": 249, "test_FD004.txt": 248,
}  # fmt: skip


def normalised_sha256(content: bytes) -> str:
    return hashlib.sha256(content.replace(b"\r\n", b"\n")).hexdigest()


def _members(archive: zipfile.ZipFile, depth: int = 0) -> Iterator[tuple[str, bytes]]:
    """Yield (basename, bytes) for every file, looking one level into nested zip files."""
    for info in archive.infolist():
        if info.is_dir():
            continue
        name = Path(info.filename).name
        data = archive.read(info)
        if name.lower().endswith(".zip") and depth == 0:
            with zipfile.ZipFile(io.BytesIO(data)) as inner:
                yield from _members(inner, depth + 1)
        else:
            yield name, data


def extract_verified(zip_bytes: bytes, dest: Path) -> list[Path]:
    """Write the 12 expected files to ``dest`` after checking their checksums."""
    found: dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        for name, data in _members(archive):
            if name in CHECKSUMS:
                found[name] = data
    missing = sorted(set(CHECKSUMS) - set(found))
    if missing:
        raise FileNotFoundError(f"missing from the archive: {', '.join(missing)}")
    bad = [n for n, data in found.items() if normalised_sha256(data) != CHECKSUMS[n]]
    if bad:
        raise ValueError(f"checksum mismatch: {', '.join(sorted(bad))}")
    dest.mkdir(parents=True, exist_ok=True)
    written = []
    for name, data in sorted(found.items()):
        path = dest / name
        path.write_bytes(data.replace(b"\r\n", b"\n"))
        written.append(path)
    return written


def verify_directory(directory: Path) -> dict[str, bool]:
    """Checksum status of each expected file in an existing directory."""
    status = {}
    for name, digest in CHECKSUMS.items():
        path = directory / name
        status[name] = path.is_file() and normalised_sha256(path.read_bytes()) == digest
    return status


def download(url: str = NASA_URL, timeout: float = 120.0) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "aeromro-agentic-copilot"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (fixed https URL)
        return response.read()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Download and verify NASA C-MAPSS.")
    parser.add_argument("--dest", type=Path, default=Path("data/raw/CMAPSSData"))
    parser.add_argument("--url", default=NASA_URL, help="archive URL (default: NASA)")
    parser.add_argument("--from-zip", type=Path, help="use a local copy of CMAPSSData.zip")
    parser.add_argument("--verify-only", action="store_true", help="check files already in --dest")
    args = parser.parse_args(argv)

    if args.verify_only:
        status = verify_directory(args.dest)
        for name, ok in status.items():
            print(f"{'ok ' if ok else 'BAD'} {name}")
        raise SystemExit(0 if all(status.values()) else 1)

    content = args.from_zip.read_bytes() if args.from_zip else download(args.url)
    for path in extract_verified(content, args.dest):
        print(f"ok  {path}")


if __name__ == "__main__":
    main()
