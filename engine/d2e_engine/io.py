from __future__ import annotations

from pathlib import Path
from typing import Literal

import pandas as pd

FileFormat = Literal["auto", "csv", "xlsx", "txt", "dta"]


def resolve_format(input_path: Path, file_format: FileFormat) -> FileFormat:
    if file_format != "auto":
        return file_format
    ext = input_path.suffix.lower()
    if ext == ".csv":
        return "csv"
    if ext == ".xlsx":
        return "xlsx"
    if ext == ".txt":
        return "txt"
    if ext == ".dta":
        return "dta"
    raise ValueError(f"Unsupported input file extension: {ext}")


def read_data(input_path: Path, file_format: FileFormat = "auto") -> pd.DataFrame:
    resolved = resolve_format(input_path, file_format)
    if resolved == "csv":
        return pd.read_csv(input_path)
    if resolved == "xlsx":
        return pd.read_excel(input_path)
    if resolved == "txt":
        return pd.read_csv(input_path, sep=None, engine="python")
    if resolved == "dta":
        return pd.read_stata(input_path)
    raise ValueError(f"Unsupported format: {resolved}")
