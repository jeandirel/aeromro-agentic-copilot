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


class FakeResponse:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self) -> bytes:
        return self.data


def test_fetch_retries_then_succeeds():
    calls, waits = [], []

    def opener(request, timeout):
        calls.append(request.full_url)
        if len(calls) < 3:
            raise OSError("temporary failure")
        return FakeResponse(b"payload")

    data = dl.fetch("https://example.org/x", opener=opener, sleep=waits.append, backoff_s=1)
    assert data == b"payload"
    assert len(calls) == 3 and waits == [1, 2]


def test_fetch_gives_up_after_the_last_attempt():
    def opener(request, timeout):
        raise OSError("down")

    with pytest.raises(OSError, match="down"):
        dl.fetch("https://example.org/x", opener=opener, sleep=lambda s: None, attempts=2)


def test_mirror_files_are_verified(fake_files, tmp_path, monkeypatch):
    served = dict(fake_files)
    monkeypatch.setattr(dl, "fetch", lambda url, **kw: served[url.rsplit("/", 1)[1]])
    written = dl.download_from_mirror("https://mirror.example/", tmp_path)
    assert len(written) == 12 and all(dl.verify_directory(tmp_path).values())

    served["train_FD002.txt"] = b"tampered\n"
    with pytest.raises(ValueError, match="train_FD002.txt"):
        dl.download_from_mirror("https://mirror.example/", tmp_path / "other")


def test_cli_falls_back_to_the_mirror(fake_files, tmp_path, monkeypatch):
    def failing_download(url, **kw):
        raise OSError("NASA unreachable")

    monkeypatch.setattr(dl, "download", failing_download)
    monkeypatch.setattr(dl, "fetch", lambda url, **kw: fake_files[url.rsplit("/", 1)[1]])
    dl.main(["--dest", str(tmp_path)])
    assert all(dl.verify_directory(tmp_path).values())

    monkeypatch.setattr(dl, "fetch", failing_download)
    with pytest.raises(OSError):
        dl.main(["--dest", str(tmp_path / "none"), "--mirror", ""])
