from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from d2e_engine.io import read_data
from d2e_engine.profile import profile_dataframe
from d2e_engine.summarize import build_summary, load_mapping


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def cmd_profile(args: argparse.Namespace) -> int:
    df = read_data(Path(args.input), args.format)
    payload = {"ok": True, "schema_profile": profile_dataframe(df), "warnings": [], "errors": []}
    _write_json(Path(args.out), payload)
    print(f"Wrote profile to {args.out}")
    return 0


def cmd_summarize(args: argparse.Namespace) -> int:
    df = read_data(Path(args.input), args.format)
    mapping = load_mapping(Path(args.mapping))
    payload = {"ok": True, **build_summary(df, mapping), "warnings": [], "errors": []}
    _write_json(Path(args.out), payload)
    print(f"Wrote summary to {args.out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="d2e_engine")
    sub = parser.add_subparsers(dest="command", required=True)

    profile = sub.add_parser("profile")
    profile.add_argument("--input", required=True)
    profile.add_argument("--format", default="auto", choices=["auto", "csv", "xlsx", "txt", "dta"])
    profile.add_argument("--out", required=True)
    profile.set_defaults(handler=cmd_profile)

    summarize = sub.add_parser("summarize")
    summarize.add_argument("--input", required=True)
    summarize.add_argument("--mapping", required=True)
    summarize.add_argument("--format", default="auto", choices=["auto", "csv", "xlsx", "txt", "dta"])
    summarize.add_argument("--out", required=True)
    summarize.set_defaults(handler=cmd_summarize)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
