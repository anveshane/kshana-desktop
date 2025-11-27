import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import LandingScreen from './components/landing/LandingScreen/LandingScreen';
import WorkspaceLayout from './components/layout/WorkspaceLayout/WorkspaceLayout';
import './styles/global.scss';

function AppContent() {
  const { projectDirectory } = useWorkspace();

  if (!projectDirectory) {
    return <LandingScreen />;
  }

  return <WorkspaceLayout />;
}

export default function App() {
  return (
    <WorkspaceProvider>
      <AppContent />
    </WorkspaceProvider>
  );
}
