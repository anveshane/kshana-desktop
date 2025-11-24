# Kshana Desktop Application

Electron-based desktop application for the Kshana video generation platform. This application bundles the Kshana Python backend and provides a native desktop interface.

## Features

- 🖥️ **Native Desktop App**: Built with Electron for cross-platform support
- 🔧 **Bundled Backend**: Includes the full Kshana Python backend (no separate installation needed)
- 💬 **Chat Interface**: Minimal chat UI for interacting with the video generation system
- ⚙️ **Settings Management**: Configure LM Studio and ComfyUI URLs via app settings
- 🚀 **Auto-start Backend**: Backend automatically starts when the app launches

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+ (for building the backend bundle)
- LM Studio (optional, for local LLM)
- ComfyUI (optional, for image/video generation)

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Backend Bundle

The backend is bundled using PyInstaller. Build it with:

```bash
npm run build:backend -- --python python3.13
```

### 3. Start Development Server

```bash
npm run start
```

This will:
- Start the Electron app in development mode
- Automatically start the bundled backend
- Enable hot-reload for frontend changes

## Building for Production

### Build All Platforms

```bash
npm run package
```

This will:
1. Build the frontend (main and renderer processes)
2. Build the backend bundle for the current platform
3. Package everything into installers

### Build Backend Only

```bash
npm run build:backend -- --python python3.13
```

The backend executable will be in `backend-build/dist/kshana-backend-{platform}/kshana-backend`

## Project Structure

```
kshana-frontend/
├── src/
│   ├── main/              # Electron main process
│   │   ├── backendManager.ts    # Manages Python backend lifecycle
│   │   ├── settingsManager.ts   # Persistent settings storage
│   │   └── main.ts              # Main Electron entry point
│   ├── renderer/          # React frontend
│   │   ├── components/    # UI components
│   │   └── styles/        # CSS styles
│   └── shared/            # Shared TypeScript types
├── backend-build/         # Backend bundling configuration
│   ├── build.py          # PyInstaller build script
│   ├── kshana.spec       # PyInstaller spec file
│   ├── entry.py          # Backend entry point
│   └── requirements.txt  # Python dependencies
└── assets/               # App icons and resources
```

## Configuration

### Settings

The app stores settings using Electron's native storage. Configure:

- **ComfyUI URL**: URL where ComfyUI is running (default: `http://localhost:8000`)
- **LM Studio URL**: URL where LM Studio is running (default: `http://127.0.0.1:1234`)
- **LM Studio Model**: Model name to use (default: `qwen3`)
- **LLM Provider**: Choose between `gemini` or `lmstudio`

Settings are accessible via the Settings panel in the app UI.

### Environment Variables

The backend uses environment variables passed from the Electron main process:

- `KSHANA_HOST`: Backend host (default: `127.0.0.1`)
- `KSHANA_PORT`: Backend port (auto-assigned, starts from 8001)
- `COMFYUI_BASE_URL`: ComfyUI HTTP URL
- `COMFYUI_WS_URL`: ComfyUI WebSocket URL
- `LMSTUDIO_BASE_URL`: LM Studio URL
- `LMSTUDIO_MODEL`: Model name
- `LLM_PROVIDER`: `gemini` or `lmstudio`
- `GOOGLE_API_KEY`: Google API key (if using Gemini)
