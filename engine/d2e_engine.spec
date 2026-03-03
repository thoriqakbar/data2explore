# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for d2e_engine — onedir mode

a = Analysis(
    ["d2e_engine/__main__.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        # All d2e_engine submodules (PyInstaller may miss lazy/dynamic imports)
        "d2e_engine",
        "d2e_engine.__main__",
        "d2e_engine.config",
        "d2e_engine.decisions",
        "d2e_engine.dofile",       # lazily imported at __main__.py:119
        "d2e_engine.io",
        "d2e_engine.metadata",
        "d2e_engine.output",
        "d2e_engine.performance",
        "d2e_engine.profile",
        "d2e_engine.report",
        "d2e_engine.runner",
        "d2e_engine.summarize",
        # Check modules (imported dynamically by runner)
        "d2e_engine.checks",
        "d2e_engine.checks.base",
        "d2e_engine.checks.chk001_duplicate_id",
        "d2e_engine.checks.chk002_missingness_variable",
        "d2e_engine.checks.chk004_missingness_enumerator",
        "d2e_engine.checks.chk005_range_check",
        "d2e_engine.checks.chk006_skip_logic",
        "d2e_engine.checks.chk008_outlier_zscore",
        "d2e_engine.checks.chk009_enumerator_anomaly_rate",
        "d2e_engine.checks.chk010_duration_anomaly",
        "d2e_engine.checks.chk012_allowed_values",
        # pyreadstat C extension modules
        "pyreadstat._readstat_parser",
        "pyreadstat._readstat_writer",
        # pandas compiled extensions
        "pandas._libs",
        "pandas._libs.tslibs",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "scipy",
        "IPython",
        "pytest",
        "pytest_cov",
        "_pytest",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="d2e_engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,    # engine writes to stdout/stderr for IPC capture
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="d2e_engine",
)
