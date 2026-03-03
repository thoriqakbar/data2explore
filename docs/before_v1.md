# Before v1 Publish Checklist

Tracking what needs to happen before data2explore can ship as a v1 release on GitHub.

## Must Fix (Blockers)

- [x] **LICENSE file** — MIT license added.
- [x] **README.md rewrite** — Comprehensive README with logo, value prop, features table, workflow, install/download, quick start, architecture, badges.
- [x] **Packaging / .exe installer** — electron-builder NSIS installer for Windows. `pnpm package` builds everything.
- [x] **Python bundling** — PyInstaller freezes engine into standalone `.exe`, bundled as extraResource in the installer.
- [x] **Package metadata** — `author`, `license`, `repository`, `homepage` added to all three config files.

## Should Fix (High Impact)

- [ ] **CHANGELOG.md** — Curated release notes for v1.0.0. Can generate skeleton from `git log --oneline`.
- [ ] **GitHub Actions CI** — At minimum: `pytest` on engine, `pnpm typecheck`, `pnpm build` on push/PR.
- [ ] **Issue templates** — `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml` with structured forms.
- [ ] **PR template** — `.github/PULL_REQUEST_TEMPLATE.md` with summary, test plan, checklist.
- [ ] **CONTRIBUTING.md** — Dev setup for both JS (pnpm) and Python (uv) sides, PR process, coding standards.
- [ ] **Social preview image** — 1280x640 for GitHub link previews. Adapt `header.png`.
- [ ] **Repository settings** — Description, topics (`electron`, `survey-data`, `data-quality`, `hfc`, `desktop-app`), branch protection on `master`.

## Nice-to-Have (Post-v1)

- [ ] CODE_OF_CONDUCT.md (Contributor Covenant)
- [ ] SECURITY.md (vulnerability reporting process)
- [ ] ESLint + Prettier config with pre-commit hooks (husky + lint-staged)
- [ ] Frontend tests (Vitest for React components)
- [ ] Auto-update via `electron-updater` pointed at GitHub Releases
- [ ] Code signing — Windows (Azure Trusted Signing) and macOS (Apple Developer $99/yr). Removes OS security warnings on install.
- [ ] Semantic-release for automated versioning on tag push

## Already Solid

- **Core functionality** — 9 checks, 231 pytest tests, deterministic output, 92-100% engine coverage
- **Security** — `contextIsolation: true`, no secrets in repo, synthetic sample data (5k rows, seed-generated)
- **Architecture** — Clean Electron + React + Python separation, 18 documented decisions in DECISIONS.md
- **Branding** — Custom icon set, header wordmark
- **Error handling** — Classified error display, stderr capture, recovery suggestions
- **Export** — Excel/CSV export with per-enumerator sheets, Stata .do file generation
