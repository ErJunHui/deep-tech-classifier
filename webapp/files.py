"""
Save an uploaded spreadsheet and report what is in it.

Each upload is stored as uploads/<file_id>/<safe name>, where file_id is a
fresh uuid4 hex and the safe name is the uploaded file's base name with
anything that could leave that folder, or that Windows cannot store, removed.
Reading uses the same pandas calls as data/reader.py.

Every rejection is an UploadError whose message can be shown to the user.
"""

from __future__ import annotations

import re
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = (".xlsx", ".xls", ".csv")
PREVIEW_ROWS = 4
MAX_CELL_CHARS = 300
_MAX_STEM_CHARS = 100

# Mapping key -> header candidates, in priority order (matched case-insensitively).
_HEADER_CANDIDATES: Dict[str, List[str]] = {
    "company_name": ["company_name", "company name", "company", "name"],
    "description": ["description", "about", "desc", "summary"],
    "domain": ["domain", "sector", "industry"],
    "uen": ["uen"],
}

# Control characters and the characters Windows forbids in file names.
_UNSAFE_CHARS = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')
_FILE_ID = re.compile(r"[0-9a-f]{32}")
_RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL"} | {f"{p}{i}" for p in ("COM", "LPT") for i in range(1, 10)}

_ALLOWED_TEXT = ", ".join(ALLOWED_EXTENSIONS)


class UploadError(ValueError):
    """An upload was rejected; the message is fit to show the user."""


def detect_mapping(headers: List[str]) -> Dict[str, str]:
    """
    Guess which header holds each pipeline column.

    For each key the candidates are tried in order and the first header that
    matches (case-insensitively, ignoring surrounding spaces) wins. A key with
    no match is absent.
    """
    by_lower: Dict[str, str] = {}
    for header in headers:
        by_lower.setdefault(str(header).strip().lower(), header)
    mapping: Dict[str, str] = {}
    for key, candidates in _HEADER_CANDIDATES.items():
        for candidate in candidates:
            if candidate in by_lower:
                mapping[key] = by_lower[candidate]
                break
    return mapping


def _safe_name(filename: str) -> str:
    """
    The name to store an upload under.

    Takes the base name after the last / or \\, removes control and
    Windows-reserved characters, and trims dots and spaces from both ends.
    When nothing usable is left before the extension, or the name is a
    Windows device name, it falls back to input<ext>.

    Raises:
        UploadError: no name, or an extension other than .xlsx, .xls or .csv.
    """
    base = re.split(r"[\\/]", filename or "")[-1]
    base = _UNSAFE_CHARS.sub("", base).rstrip(". ").lstrip(" ")
    stem, dot, ext = base.rpartition(".")
    ext = (dot + ext).lower() if dot else ""
    if not base:
        raise UploadError(f"The file has no name. Please choose a {_ALLOWED_TEXT} file.")
    if ext not in ALLOWED_EXTENSIONS:
        raise UploadError(f"Only {_ALLOWED_TEXT} files can be used. Please choose a spreadsheet in one of these formats.")
    stem = stem.strip(". ")[:_MAX_STEM_CHARS].rstrip(". ")
    if not stem or stem.split(".")[0].strip().upper() in _RESERVED_NAMES:
        return "input" + ext
    return stem + base[len(base) - len(ext):]


def save_upload(uploads_dir: Path, filename: str, data: bytes) -> Dict[str, Any]:
    """
    Store an uploaded file under uploads_dir and inspect it.

    Args:
        uploads_dir: Folder holding one sub-folder per upload. Created if missing.
        filename: The name the browser sent; only its cleaned base name is used.
        data: The file's contents.

    Returns:
        inspect() of the stored file.

    Raises:
        UploadError: bad name or extension, empty or too large, unreadable, or no rows.
            Nothing is left in uploads_dir.
    """
    name = _safe_name(filename)
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadError("The file is larger than 20 MB. Please upload a smaller spreadsheet.")
    if not data:
        raise UploadError("The file is empty. Please choose a spreadsheet with a header row and at least one company.")

    folder = Path(uploads_dir) / uuid.uuid4().hex
    folder.mkdir(parents=True)
    try:
        path = folder / name
        if path.resolve().parent != folder.resolve():
            raise UploadError("The file name could not be used. Please rename the file and try again.")
        path.write_bytes(data)
        return inspect(path)
    except BaseException:
        shutil.rmtree(folder, ignore_errors=True)
        raise


def _read(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path, dtype=str)
    return pd.read_excel(path, dtype=str)


def _cell(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value)[:MAX_CELL_CHARS]


def inspect(path: Path) -> Dict[str, Any]:
    """
    What the setup table needs to know about a stored upload.

    Returns:
        fileId (the upload's folder name), name (the stored file name), rows
        (data-row count), headers (as pandas names them), mapping
        (detect_mapping of headers), preview (first 4 rows as {header: cell}),
        table (every row as cells in headers order; blanks are "", cells cut
        to 300 characters) and emptyCounts ({header: rows where it is blank or
        only spaces}).

    Raises:
        UploadError: the file cannot be read as a spreadsheet, or has no rows.
    """
    path = Path(path)
    try:
        df = _read(path)
    except pd.errors.EmptyDataError:
        raise UploadError(f"{path.name} is empty. Please choose a spreadsheet with a header row and at least one company.") from None
    except Exception:
        raise UploadError(
            f"{path.name} could not be read. Please check that it is a valid {_ALLOWED_TEXT} spreadsheet "
            "(save it again from Excel if unsure) and upload it again."
        ) from None
    if len(df) == 0:
        raise UploadError(f"{path.name} has no rows below the header row. Please add the companies to classify.")

    headers = [str(c) for c in df.columns]
    table = [[_cell(v) for v in row] for row in df.itertuples(index=False, name=None)]
    empty_counts = {h: 0 for h in headers}
    for i, header in enumerate(headers):
        column = df.iloc[:, i]
        empty_counts[header] = int((column.isna() | column.astype(str).str.strip().eq("")).sum())
    return {
        "fileId": path.parent.name,
        "name": path.name,
        "rows": len(df),
        "headers": headers,
        "mapping": detect_mapping(headers),
        "preview": [dict(zip(headers, row)) for row in table[:PREVIEW_ROWS]],
        "table": table,
        "emptyCounts": empty_counts,
    }


def resolve(uploads_dir: Path, file_id: str) -> Path:
    """
    The stored file of an upload.

    Raises:
        FileNotFoundError: file_id is not 32 lowercase hex characters, or its
            folder does not hold exactly one file.
    """
    if not isinstance(file_id, str) or not _FILE_ID.fullmatch(file_id):
        raise FileNotFoundError("Unknown file")
    folder = Path(uploads_dir) / file_id
    entries = list(folder.iterdir()) if folder.is_dir() else []
    if len(entries) != 1 or not entries[0].is_file():
        raise FileNotFoundError("Unknown file")
    return entries[0]
