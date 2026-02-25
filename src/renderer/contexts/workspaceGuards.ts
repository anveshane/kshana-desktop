import type {
  ProjectSwitchGuard,
  ProjectSwitchGuardContext,
} from '../types/workspace';

export async function runProjectSwitchGuards(
  guards: Iterable<ProjectSwitchGuard>,
  context: ProjectSwitchGuardContext,
): Promise<boolean> {
  for (const guard of guards) {
    const allowed = await guard(context);
    if (!allowed) {
      return false;
    }
  }
  return true;
}
