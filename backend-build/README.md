# Backend Build Configuration

This directory contains the build configuration for bundling the Kshana Python backend into a standalone executable using PyInstaller.

## Why Bundle the Backend?

The Kshana backend is a Python application that normally requires:
- Python 3.10+ installed
- All Python dependencies installed
- Virtual environment setup

By bundling it with PyInstaller, we create a single executable that includes:
- The Python interpreter
- All dependencies
- The application code

This allows the Electron app to ship with a fully functional backend that works without requiring users to install Python.

## Build Process

### 1. Source Copying

The build script (`build.py`) copies the backend source from:
- Local path: `../kshana` (if it exists)
- Or clones from: `https://github.com/anveshane/kshana.git`

The source is copied to `backend-build/kshana/` for building.

### 2. Virtual Environment

A clean virtual environment is created in `backend-build/.venv/` with all dependencies from `requirements.txt`.

### 3. PyInstaller Bundle

PyInstaller analyzes the code and creates a single executable that includes:
- All Python modules
- All dependencies
- The Python runtime

## Known Issues and Solutions

### Issue: `ImportError: cannot import name 'AgentTool'`

**Problem**: The code uses `from google.adk.tools import AgentTool`, but `AgentTool` is not exported from `google.adk.tools.__init__.py`. It's actually in `google.adk.tools.agent_tool.AgentTool`.

**Why it works in normal Python**: When Python imports a package, it can resolve submodules dynamically. PyInstaller's static analysis doesn't always catch these dynamic imports.

**Solution**: We use a runtime hook (`pyi_rth_google_adk_tools.py`) that patches the `google.adk.tools` module at runtime to include `AgentTool`:

```python
from google.adk.tools.agent_tool import AgentTool
import google.adk.tools as tools_module
tools_module.AgentTool = AgentTool
```

This hook runs before any application code, ensuring `AgentTool` is available when the coordinator tries to import it.

### Configuration Files

- **`kshana.spec`**: PyInstaller specification file defining how to bundle the app
- **`entry.py`**: Entry point that starts the FastAPI server
- **`requirements.txt`**: Python dependencies (pinned versions for compatibility)
- **`pyi_rth_google_adk_tools.py`**: Runtime hook to fix AgentTool import

## Building

### Development Build

```bash
cd backend-build
python3.13 build.py --clean --python python3.13
```

### Via npm

```bash
npm run build:backend -- --python python3.13
```

### Output

The bundled executable is created at:
- macOS: `dist/kshana-backend-mac/kshana-backend`
- Windows: `dist/kshana-backend-win/kshana-backend.exe`
- Linux: `dist/kshana-backend-linux/kshana-backend`

## Troubleshooting

### Build Fails with Dependency Conflicts

Update `requirements.txt` with compatible versions. The current versions are tested and working together.

### Import Errors After Building

1. Check that `pyi_rth_google_adk_tools.py` exists in `backend-build/`
2. Verify `runtime_hooks=['pyi_rth_google_adk_tools.py']` is in `kshana.spec`
3. Ensure `google.adk.tools.agent_tool` is in `hiddenimports` in `kshana.spec`
4. Rebuild with `--clean` flag

### Executable is Large

This is normal - PyInstaller bundles the entire Python interpreter and all dependencies. The macOS executable is typically 100-200MB.

## Platform-Specific Notes

### macOS

- The executable is not code-signed by default
- You may need to allow it in System Preferences → Security & Privacy
- For distribution, consider code signing with an Apple Developer certificate

### Windows

- The executable will be `kshana-backend.exe`
- May trigger Windows Defender warnings (false positive)
- Consider code signing for distribution

### Linux

- The executable should work on most modern Linux distributions
- May need to install system dependencies if missing

