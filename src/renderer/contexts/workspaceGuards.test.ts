import { describe, expect, it, jest } from '@jest/globals';
import { runProjectSwitchGuards } from './workspaceGuards';

describe('runProjectSwitchGuards', () => {
  it('returns false when any guard blocks the switch', async () => {
    const guardA = jest.fn(async () => true);
    const guardB = jest.fn(async () => false);
    const guardC = jest.fn(async () => true);

    const result = await runProjectSwitchGuards(
      [guardA, guardB, guardC],
      {
        fromProjectDirectory: '/tmp/project-a',
        toProjectDirectory: '/tmp/project-b',
      },
    );

    expect(result).toBe(false);
    expect(guardA).toHaveBeenCalledTimes(1);
    expect(guardB).toHaveBeenCalledTimes(1);
    expect(guardC).not.toHaveBeenCalled();
  });

  it('returns true when all guards allow the switch', async () => {
    const guardA = jest.fn(async () => true);
    const guardB = jest.fn(async () => true);

    const result = await runProjectSwitchGuards(
      [guardA, guardB],
      {
        fromProjectDirectory: '/tmp/project-a',
        toProjectDirectory: '/tmp/project-b',
      },
    );

    expect(result).toBe(true);
    expect(guardA).toHaveBeenCalledTimes(1);
    expect(guardB).toHaveBeenCalledTimes(1);
  });
});
