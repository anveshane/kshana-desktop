#!/usr/bin/env python3
"""
Utility script to bundle the Kshana backend with PyInstaller (Option A).

Usage examples:
    python backend-build/build.py
    python backend-build/build.py --source-path ../kshana --platform auto
"""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence


REPO_URL = "https://github.com/anveshane/kshana.git"
ROOT = Path(__file__).resolve().parent
BACKEND_SRC_DIR = ROOT / "kshana"
DIST_DIR = ROOT / "dist"
BUILD_DIR = ROOT / "build-artifacts"
SPEC_PATH = ROOT / "kshana.spec"
ENTRY_PATH = ROOT / "entry.py"
REQUIREMENTS_PATH = ROOT / "requirements.txt"
VENV_PATH = ROOT / ".venv"


def run(
    cmd: Sequence[str],
    cwd: Path | None = None,
    env: dict | None = None,
) -> None:
    """Run a subprocess and stream output."""
    print(f"→ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True, env=env)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bundle the Kshana backend")
    parser.add_argument(
        "--source-path",
        type=Path,
        help="Existing local checkout of the kshana backend to copy from",
    )
    parser.add_argument(
        "--ref",
        default="main",
        help="Git ref to checkout when cloning from the remote repository",
    )
    parser.add_argument(
        "--platform",
        choices=["auto", "mac", "win", "linux"],
        default="auto",
        help="Target platform name (used for output folder naming)",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove previous dist/build folders before building",
    )
    parser.add_argument(
        "--python",
        default=sys.executable,
        help="Path to Python interpreter (>=3.10) used for the virtual environment",
    )
    return parser.parse_args()


def ensure_python_version(python_cmd: str) -> None:
    """Ensure the interpreter supports structural pattern matching (>=3.10)."""
    version_str = subprocess.check_output(
        [
            python_cmd,
            "-c",
            "import sys; print('.'.join(map(str, sys.version_info[:3])))",
        ],
        text=True,
    ).strip()
    major, minor, patch = (int(part) for part in version_str.split("."))
    if (major, minor) < (3, 10):
        raise RuntimeError(
            f"Python 3.10+ is required. Interpreter '{python_cmd}' reports {version_str}. "
            "Use --python to provide a newer runtime (e.g., pyenv, uv, or Python.org builds)."
        )


def ensure_backend_sources(args: argparse.Namespace) -> None:
    """Clone or copy the backend sources into backend-build/kshana."""
    if args.source_path is None:
        local_candidate = ROOT.parent.parent / "kshana"
        if local_candidate.exists():
            args.source_path = local_candidate

    if args.source_path:
        source = args.source_path.resolve()
        if not source.exists():
            raise FileNotFoundError(f"Provided source path does not exist: {source}")
        if BACKEND_SRC_DIR.exists():
            shutil.rmtree(BACKEND_SRC_DIR)
        shutil.copytree(
            source,
            BACKEND_SRC_DIR,
            ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc", ".venv", "dist", "build", "outputs"),
            dirs_exist_ok=False,
        )
        print(f"✓ Copied backend from {source}")
        return

    if BACKEND_SRC_DIR.exists():
        print("✓ Existing backend checkout detected. Delete it manually to re-clone.")
        return

    run(["git", "clone", REPO_URL, str(BACKEND_SRC_DIR)])
    if args.ref and args.ref != "main":
        run(["git", "checkout", args.ref], cwd=BACKEND_SRC_DIR)


def ensure_venv(python_cmd: str) -> Path:
    """Create a local virtual environment for PyInstaller if needed."""
    ensure_python_version(python_cmd)
    if not VENV_PATH.exists():
        run([python_cmd, "-m", "venv", str(VENV_PATH)])
    python_bin = (
        VENV_PATH / "Scripts" / "python.exe"
        if platform.system() == "Windows"
        else VENV_PATH / "bin" / "python3"
    )
    run([str(python_bin), "-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"])
    run([str(python_bin), "-m", "pip", "install", "-r", str(REQUIREMENTS_PATH)])
    return python_bin


def clean_previous_outputs() -> None:
    """Remove build/dist folders to ensure a clean bundle."""
    for path in (DIST_DIR, BUILD_DIR):
        if path.exists():
            shutil.rmtree(path)


def compute_output_name(args: argparse.Namespace) -> str:
    if args.platform != "auto":
        return args.platform
    system = platform.system().lower()
    if system.startswith("darwin"):
        return "mac"
    if system.startswith("windows"):
        return "win"
    return "linux"


def build_bundle(python_bin: Path, output_suffix: str) -> None:
    """Invoke PyInstaller with the prepared spec file."""
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_SRC_DIR)

    run(
        [
            str(python_bin),
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(DIST_DIR / f"kshana-backend-{output_suffix}"),
            "--workpath",
            str(BUILD_DIR),
            str(SPEC_PATH),
        ],
        cwd=ROOT,
        env=env,
    )


def main() -> None:
    args = parse_args()
    if args.clean:
        clean_previous_outputs()
    ensure_backend_sources(args)
    python_bin = ensure_venv(args.python)
    output_suffix = compute_output_name(args)
    build_bundle(python_bin, output_suffix)
    print("✅ Backend bundle created successfully.")


if __name__ == "__main__":
    main()

