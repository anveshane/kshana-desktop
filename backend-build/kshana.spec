# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller specification for the bundled Kshana backend.

The spec is designed for the --onefile workflow and expects the backend source
to live in `backend-build/kshana`.
"""
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata


block_cipher = None

project_root = Path.cwd()
backend_src = project_root / "kshana"

hiddenimports = sorted(
    set(
        collect_submodules("app")
        + collect_submodules("google")
        + [
            "uvicorn",
            "uvicorn.lifespan.on",
            "google.adk.tools.agent_tool",  # AgentTool is not exported from __init__.py
        ]
    )
)

datas = collect_data_files("app", includes=["*.json"])
datas += copy_metadata("google-adk")
datas += copy_metadata("google-genai")

a = Analysis(
    ["entry.py"],
    pathex=[str(project_root), str(backend_src)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="kshana-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

