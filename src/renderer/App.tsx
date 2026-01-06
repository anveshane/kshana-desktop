import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { TimelineProvider } from './contexts/TimelineContext';
import { ProjectProvider, useProject } from './contexts/ProjectContext';
import LandingScreen from './components/landing/LandingScreen/LandingScreen';
import WorkspaceLayout from './components/layout/WorkspaceLayout/WorkspaceLayout';
import './styles/global.scss';

function AppContent() {
  const { projectDirectory } = useWorkspace();
  const { isLoaded: projectLoaded } = useProject();

  // Show landing if no project directory OR no project loaded
  if (!projectDirectory && !projectLoaded) {
    return <LandingScreen />;
  }

  return <WorkspaceLayout />;
}

export default function App() {
  return (
    <WorkspaceProvider>
      <ProjectProvider>
        <TimelineProvider>
          <AppContent />
        </TimelineProvider>
      </ProjectProvider>
    </WorkspaceProvider>
  );
}
