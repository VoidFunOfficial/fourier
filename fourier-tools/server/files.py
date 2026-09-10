"""Opaque file IDs; callers never choose server input or output paths."""

import json
import mimetypes
import re
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4


class FileTooLarge(ValueError):
    pass


class FileStore:
    def __init__(self, root, max_bytes=100 * 1024 * 1024):
        self.root = Path(root).resolve()
        self.max_bytes = max_bytes

    def save(self, stream, filename):
        self.root.mkdir(parents=True, exist_ok=True)
        file_id = uuid4().hex
        filename = Path((filename or "upload.bin").replace("\\", "/")).name
        filename = re.sub(r"[^\w. -]", "_", filename)[:180] or "upload.bin"
        suffix = Path(filename).suffix.lower()
        if not re.fullmatch(r"\.[a-z0-9]{1,10}", suffix):
            suffix = ".bin"
        with TemporaryDirectory(prefix=".upload-", dir=self.root) as temporary:
            directory = Path(temporary)
            size = 0
            with (directory / ("data" + suffix)).open("wb") as target:
                while chunk := stream.read(1024 * 1024):
                    size += len(chunk)
                    if size > self.max_bytes:
                        raise FileTooLarge("File exceeds the size limit")
                    target.write(chunk)
            if not size:
                raise ValueError("File is empty")
            record = {"id": file_id, "name": filename, "size": size,
                      "mediaType": mimetypes.guess_type(filename)[0] or "application/octet-stream",
                      "url": f"/v1/files/{file_id}/content"}
            (directory / "metadata.json").write_text(json.dumps(record), encoding="utf-8")
            directory.rename(self.root / file_id)
        return record

    def add(self, path):
        with Path(path).open("rb") as source:
            return self.save(source, Path(path).name)

    def get(self, file_id):
        if not re.fullmatch(r"[0-9a-f]{32}", file_id):
            raise FileNotFoundError("File not found")
        directory = self.root / file_id
        if directory.is_symlink():
            raise FileNotFoundError("File not found")
        try:
            metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
            path = next(directory.glob("data.*"))
        except (FileNotFoundError, StopIteration):
            raise FileNotFoundError("File not found") from None
        if path.is_symlink() or not path.is_file():
            raise FileNotFoundError("File not found")
        return metadata, path

    def delete(self, file_id):
        self.get(file_id)
        shutil.rmtree(self.root / file_id)
