# Kshana Desktop Application

Electron-based desktop application for the Kshana video generation platform. This application uses the kshana-ink TypeScript backend and provides a native desktop interface.

## Features

- 🖥️ **Native Desktop App**: Built with Electron for cross-platform support
- 🔧 **TypeScript Backend**: Uses kshana-ink for AI-powered video generation (no Python needed!)
- 💬 **Chat Interface**: Minimal chat UI for interacting with the video generation system
- ⚙️ **Settings Management**: Configure LM Studio and ComfyUI URLs via app settings
- 🚀 **Auto-start Backend**: Backend automatically starts when the app launches

## Prerequisites

- Node.js 20+ and npm
- LM Studio (optional, for local LLM)
- ComfyUI (optional, for image/video generation)

## Development Setup

### 1. Build kshana-ink

First, ensure kshana-ink is built:

```bash
cd ../kshana-ink
pnpm install
pnpm build
```

### 2. Install Dependencies

```bash
cd ../kshana-frontend
npm install
```

### 3. Start Development Server

```bash
npm run start
```

This will:
- Start the Electron app in development mode
- Automatically start the kshana-ink backend
- Enable hot-reload for frontend changes

## Building for Production

### Build All Platforms

```bash
npm run package
```

This will:
1. Build the frontend (main and renderer processes)
2. Package everything into installers

### Running the Built App

The packaged application includes the kshana-ink backend and runs entirely from the installer - no external dependencies required!

## Project Structure

```
kshana-frontend/
├── src/
│   ├── main/              # Electron main process
│   │   ├── backendManager.ts    # Manages kshana-ink backend lifecycle
│   │   ├── settingsManager.ts   # Persistent settings storage
│   │   └── main.ts              # Main Electron entry point
│   ├── renderer/          # React frontend
│   │   ├── components/    # UI components
│   │   └── styles/        # CSS styles
│   └── shared/            # Shared TypeScript types
└── assets/               # App icons and resources
```

## Configuration

### Settings

The app stores settings using Electron's native storage. Configure:

- **ComfyUI URL**: URL where ComfyUI is running (default: `http://localhost:8000`)
- **LM Studio URL**: URL where LM Studio is running (default: `http://127.0.0.1:1234`)
- **LM Studio Model**: Model name to use (default: `qwen3`)
- **LLM Provider**: Choose between `gemini`, `lmstudio`, or `openrouter`

Settings are accessible via the Settings panel in the app UI.

### Environment Variables

The backend uses environment variables set by the Electron main process:

- `LLM_PROVIDER`: `gemini`, `lmstudio`, or `openrouter`
- `LMSTUDIO_BASE_URL`: LM Studio URL
- `LMSTUDIO_MODEL`: Model name
- `GOOGLE_API_KEY`: Google API key (if using Gemini)
- `COMFYUI_BASE_URL`: ComfyUI HTTP URL

## WebSocket API

The kshana-ink backend exposes a WebSocket API at `/api/v1/ws/chat`.

### Client → Server Messages

```typescript
// Start a new task
{ type: "start_task", data: { task: "Create a video about..." } }

// Respond to agent question
{ type: "user_response", data: { response: "Yes, proceed" } }

// Cancel current task
{ type: "cancel" }

// Keep-alive
{ type: "ping" }
```

### Server → Client Messages

```typescript
// Connection status
{ type: "status", sessionId, timestamp, data: { status: "connected" | "ready" | "busy" | "completed" | "error", message? } }

// Agent progress
{ type: "progress", sessionId, timestamp, data: { iteration, maxIterations, status } }

// Streaming text
{ type: "stream_chunk", sessionId, timestamp, data: { content, done } }

// Final response
{ type: "agent_response", sessionId, timestamp, data: { output, status } }

// Agent asking a question
{ type: "agent_question", sessionId, timestamp, data: { question, toolCallId } }

// Tool execution
{ type: "tool_call", sessionId, timestamp, data: { toolName, status, arguments, result?, error? } }

// Todo updates
{ type: "todo_update", sessionId, timestamp, data: { todos: [...] } }

// Error
{ type: "error", sessionId, timestamp, data: { code, message, details? } }
```

## Architecture

### Backend Integration

The kshana-ink backend is imported directly into the Electron main process:

1. On app start, `BackendManager` dynamically imports kshana-ink
2. Creates a Fastify server with WebSocket support
3. Server listens on port 8001 (or next available)
4. Health check at `/api/v1/health` confirms server is ready

### Communication Flow

```
[Renderer Process]
       ↓ WebSocket
[kshana-ink Server] (in Main Process)
       ↓ HTTP/Tool Calls
[ComfyUI / LLM Provider]
```
