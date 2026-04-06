export type ChatRestoreStatus = 'idle' | 'restoring' | 'restored' | 'missing';

export interface ChatRestoreState {
  projectDirectory: string | null;
  status: ChatRestoreStatus;
}

export function isChatRestoreCompleteForProject(
  restoreState: ChatRestoreState,
  projectDirectory: string | null | undefined,
): boolean {
  if (!projectDirectory) {
    return false;
  }

  return (
    restoreState.projectDirectory === projectDirectory &&
    (restoreState.status === 'restored' || restoreState.status === 'missing')
  );
}

export function shouldPersistChatSnapshot(params: {
  currentProjectDirectory: string | null | undefined;
  targetProjectDirectory: string | null | undefined;
  restoreState: ChatRestoreState;
}): boolean {
  const { currentProjectDirectory, targetProjectDirectory, restoreState } =
    params;
  if (!currentProjectDirectory || !targetProjectDirectory) {
    return false;
  }

  if (currentProjectDirectory !== targetProjectDirectory) {
    return false;
  }

  return isChatRestoreCompleteForProject(restoreState, targetProjectDirectory);
}

export function shouldAutoConnectChat(params: {
  projectDirectory: string | null | undefined;
  restoreState: ChatRestoreState;
}): boolean {
  return isChatRestoreCompleteForProject(
    params.restoreState,
    params.projectDirectory,
  );
}
