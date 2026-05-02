/**
 * Test entry component. Used in place of <App /> when KSHANA_TEST_BRIDGE=1.
 *
 * Mounts ChatPanelEmbedded inside the real WorkspaceProvider and calls
 * `openProject(scenarioProjectDir)` on mount. The fake `window.electron`
 * bridge stubs all project-fs calls to succeed, so the workspace lands
 * in the "project open" state without touching disk.
 *
 * Goal: exercise the chat-panel surface area (tool rendering, message
 * flow, edits, regen) in isolation. We skip LandingScreen, AgentProvider,
 * TimelineProvider, etc. because the chat panel only consumes Workspace.
 */
import { useEffect, useState } from 'react';
import {
  WorkspaceProvider,
  useWorkspace,
} from '../contexts/WorkspaceContext';
import ChatPanelEmbedded from '../components/chat/ChatPanelEmbedded/ChatPanelEmbedded';
import ScenarioPicker from './ScenarioPicker';

function ProjectBootstrap({ children }: { children: React.ReactNode }) {
  const { openProject, projectDirectory } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  // Settles to true once we've waited the grace window without a
  // scenario landing — at that point we render the picker.
  const [graceExpired, setGraceExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tryOpen = () => {
      const p = window.__kshanaTest?.getProject();
      if (!p?.directory || cancelled) return;
      openProject(p.directory).catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    };
    // Attempt immediately (scenario may already be loaded via initScript
    // or ?scenario=NAME) and retry briefly if loadScenario is called
    // after navigation (e.g., from a Playwright test).
    tryOpen();
    const interval = setInterval(() => {
      const p = window.__kshanaTest?.getProject();
      if (p?.directory) {
        tryOpen();
        clearInterval(interval);
      }
    }, 50);
    // After a short grace window, fall through to the manual picker.
    const stop = setTimeout(() => {
      clearInterval(interval);
      if (!cancelled) setGraceExpired(true);
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [openProject]);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#f55' }}>
        TestApp openProject failed: {error}
      </div>
    );
  }
  if (!projectDirectory) {
    if (graceExpired) {
      return <ScenarioPicker />;
    }
    return (
      <div
        data-testid="test-bridge-waiting"
        style={{ padding: 16, color: '#888' }}
      >
        Waiting for scenario…
      </div>
    );
  }
  return <>{children}</>;
}

export default function TestApp() {
  return (
    <WorkspaceProvider>
      <ProjectBootstrap>
        <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
          <ChatPanelEmbedded />
        </div>
      </ProjectBootstrap>
    </WorkspaceProvider>
  );
}
