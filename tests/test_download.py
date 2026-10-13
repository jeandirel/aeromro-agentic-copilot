import io
import zipfile

import pytest

from aeromro.data import download as dl


def make_zip(files: dict[str, bytes], nested: bool = False) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        for name, data in files.items():
            z.writestr(f"CMAPSSData/{name}", data)
    if not nested:
        return buffer.getvalue()
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, "w") as z:
        z.writestr("Turbofan/CMAPSSData.zip", buffer.getvalue())
    return outer.getvalue()


@pytest.fixture
def fake_files(monkeypatch):
    files = {name: f"1 1 0.0\r\n{name}\r\n".encode() for name in dl.CHECKSUMS}
    monkeypatch.setattr(
        dl, "CHECKSUMS", {name: dl.normalised_sha256(data) for name, data in files.items()}
    )
    return files


@pytest.mark.parametrize("nested", [False, True])
def test_extract_verified_writes_normalised_files(fake_files, tmp_path, nested):
    written = dl.extract_verified(make_zip(fake_files, nested=nested), tmp_path)
    assert len(written) == 12
    assert b"\r" not in (tmp_path / "train_FD001.txt").read_bytes()
    assert all(dl.verify_directory(tmp_path).values())


def test_tampered_file_is_rejected(fake_files, tmp_path):
    fake_files["RUL_FD001.txt"] = b"999\n"
    with pytest.raises(ValueError, match="RUL_FD001.txt"):
        dl.extract_verified(make_zip(fake_files), tmp_path)


def test_missing_file_is_reported(fake_files, tmp_path):
    del fake_files["test_FD004.txt"]
    with pytest.raises(FileNotFoundError, match="test_FD004.txt"):
        dl.extract_verified(make_zip(fake_files), tmp_path)


def test_line_endings_do_not_change_the_checksum():
    assert dl.normalised_sha256(b"a\r\nb\r\n") == dl.normalised_sha256(b"a\nb\n")
