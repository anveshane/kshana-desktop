import { createRoot } from 'react-dom/client';
import App from './App';

// Error boundary for renderer
window.addEventListener('error', (event) => {
  console.error('Renderer error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

const container = document.getElementById('root');
if (!container) {
  console.error('Root container not found!');
  document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: Root container not found</div>';
} else if (!window.electron) {
  console.error('window.electron is not defined. Preload script might have failed.');
  container.innerHTML = `
    <div style="padding: 20px; color: white; background: #1a1a1a; height: 100vh; font-family: system-ui;">
      <h1>Startup Error</h1>
      <p>The application failed to initialize properly.</p>
      <p>Error: <code>window.electron</code> is undefined.</p>
      <p>This usually means the preload script failed to load.</p>
    </div>
  `;
} else {
  try {
    const root = createRoot(container);
    root.render(<App />);
    console.log('React app rendered successfully');
  } catch (error) {
    console.error('Failed to render React app:', error);
    container.innerHTML = `<div style="padding: 20px; color: red;">Error: ${(error as Error).message}</div>`;
  }
}

// calling IPC exposed from preload script
window.electron?.ipcRenderer.once('ipc-example', (arg) => {
  // eslint-disable-next-line no-console
  console.log(arg);
});
window.electron?.ipcRenderer.sendMessage('ipc-example', ['ping']);
