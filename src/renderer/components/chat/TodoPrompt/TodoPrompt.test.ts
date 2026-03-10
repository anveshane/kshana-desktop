import { describe, expect, it } from '@jest/globals';
import { buildTodoPromptSummary } from './TodoPrompt';

describe('TodoPrompt helpers', () => {
  it('builds summary-first progress metadata for docked todos', () => {
    const summary = buildTodoPromptSummary([
      { id: '1', task: 'Read project', status: 'completed' },
      { id: '2', task: 'Generate outline', status: 'in_progress' },
      { id: '3', task: 'Create prompts', status: 'pending' },
    ]);

    expect(summary.visibleTodos).toHaveLength(3);
    expect(summary.completedCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.currentTask).toBe('Generate outline');
  });

  it('shows interrupted in-progress todos as pending', () => {
    const summary = buildTodoPromptSummary(
      [
        { id: '1', task: 'Read project', status: 'completed' },
        { id: '2', task: 'Generate outline', status: 'in_progress' },
        { id: '3', task: 'Create prompts', status: 'pending' },
      ],
      false,
    );

    expect(summary.visibleTodos[1]?.status).toBe('pending');
    expect(summary.currentTask).toBe('Pending: Generate outline');
  });
});
