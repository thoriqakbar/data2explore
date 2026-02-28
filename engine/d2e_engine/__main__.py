from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any

from d2e_engine.config import load_config
from d2e_engine.io import read_data
from d2e_engine.metadata import build_run_metadata
from d2e_engine.output import build_summary_json, flags_to_csv, load_prior_flags, summary_to_json
from d2e_engine.profile import profile_dataframe
from d2e_engine.runner import run_all_checks
from d2e_engine.summarize import build_summary, load_mapping

logger = logging.getLogger(__name__)


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


def cmd_check(args: argparse.Namespace) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    df = read_data(Path(args.input), args.format)
    mapping = load_mapping(Path(args.mapping))
    config = load_config(args.config)

    run_id, metadata = build_run_metadata(
        dataset_path=args.input,
        config=config,
        app_version=args.app_version,
    )

    flags = run_all_checks(df, mapping, config, run_id)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    flags_to_csv(flags, out_dir / "flags.csv")
    _write_json(out_dir / "run_metadata.json", metadata)

    prior_flags = load_prior_flags(args.prior_flags)
    summary = build_summary_json(flags, run_id, prior_flags if args.prior_flags else None)
    summary_to_json(summary, out_dir / "summary.json")

    print(f"Check complete: {len(flags)} flag(s) written to {out_dir}")
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

    check = sub.add_parser("check")
    check.add_argument("--input", required=True)
    check.add_argument("--mapping", required=True)
    check.add_argument("--out-dir", required=True)
    check.add_argument("--format", default="auto", choices=["auto", "csv", "xlsx", "txt", "dta"])
    check.add_argument("--config", default=None, help="JSON config file (optional, overrides defaults)")
    check.add_argument("--prior-flags", default=None, help="Prior flags.csv for delta comparison")
    check.add_argument("--app-version", default=None, help="App version for run metadata")
    check.set_defaults(handler=cmd_check)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
