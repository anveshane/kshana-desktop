#!/usr/bin/env python3
"""
Executable entry point for the bundled Kshana backend.

This wrapper ensures:
- The `kshana` source tree is on `sys.path` while building locally.
- Environment variables from `.env` are loaded for parity with production.
- The FastAPI server boots via the existing CLI `start()` helper.
- Patches google.adk.tools to export AgentTool (PyInstaller compatibility).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# CRITICAL: Patch google.adk.tools BEFORE any application imports
# This must happen before app.agents.coordinator is imported
def _patch_google_adk_tools():
    """Patch google.adk.tools to export AgentTool for PyInstaller compatibility."""
    try:
        # Import the actual AgentTool class
        from google.adk.tools.agent_tool import AgentTool
        # Import the tools module
        import google.adk.tools
        # Patch it if not already patched
        if not hasattr(google.adk.tools, 'AgentTool'):
            google.adk.tools.AgentTool = AgentTool
    except ImportError:
        # If this fails, the runtime hook should handle it
        # But we try here first as a backup
        pass

# Run the patch immediately
_patch_google_adk_tools()


def _ensure_project_on_path() -> Path:
    """Add the kshana source tree to sys.path when running unbundled."""
    root_dir = Path(__file__).resolve().parent
    backend_src = root_dir / "kshana"
    if backend_src.exists() and str(backend_src) not in sys.path:
        sys.path.insert(0, str(backend_src))
    return backend_src


def _load_dotenv(project_dir: Path) -> None:
    """Load environment variables from the backend's `.env` file if present."""
    env_path = project_dir / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv

            load_dotenv(dotenv_path=env_path)
        except ModuleNotFoundError:
            # When running inside the bundled binary, python-dotenv is packaged.
            # When running locally without dependencies, skipping is acceptable.
            pass


def main() -> None:
    """Entrypoint invoked by PyInstaller."""
    backend_src = _ensure_project_on_path()
    _load_dotenv(backend_src)

    # Ensure the backend binds to localhost by default when spawned from Electron.
    os.environ.setdefault("KSHANA_HOST", "127.0.0.1")
    os.environ.setdefault("KSHANA_PUBLIC_HOST", "127.0.0.1")

    # Import after path setup - type checker can't see runtime path manipulation
    from app.cli import start  # type: ignore[import-untyped]

    start()


if __name__ == "__main__":
    main()

