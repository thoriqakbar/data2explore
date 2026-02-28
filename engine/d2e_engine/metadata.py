from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from d2e_engine import __version__


def sha256_file(path: str | Path) -> str:
    """Return hex SHA-256 of a file, read in 64 KiB chunks."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65_536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def sha256_json(obj: Any) -> str:
    """Deterministic hex SHA-256 of a JSON-serialisable object."""
    canonical = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_run_metadata(
    dataset_path: str | Path,
    config: dict[str, Any],
    app_version: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Build run metadata and return (run_id, metadata_dict)."""
    run_id = str(uuid.uuid4())
    metadata = {
        "run_id": run_id,
        "dataset_path": str(dataset_path),
        "dataset_hash": sha256_file(dataset_path),
        "config_hash": sha256_json(config),
        "engine_version": __version__,
        "app_version": app_version or "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return run_id, metadata
