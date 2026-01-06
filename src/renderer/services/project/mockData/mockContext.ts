/**
 * Mock Context Index Data
 * Context variables for the "Desert Survival Story" project
 */

import type { ContextIndex } from '../../../types/kshana';

/**
 * Mock context index with various stored context variables
 */
export const MOCK_CONTEXT_INDEX: ContextIndex = {
  plan: {
    variable_name: 'plan',
    label: 'Story Plan',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    char_count: 2450,
    source: 'tool',
  },
  story: {
    variable_name: 'story',
    label: 'Full Story',
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    char_count: 8720,
    source: 'tool',
  },
  characters: {
    variable_name: 'characters',
    label: 'Character Descriptions',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    char_count: 4200,
    source: 'tool',
  },
  settings: {
    variable_name: 'settings',
    label: 'Setting Descriptions',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    char_count: 3100,
    source: 'tool',
  },
  scenes: {
    variable_name: 'scenes',
    label: 'Scene Breakdown',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    char_count: 5600,
    source: 'tool',
  },
  user_feedback: {
    variable_name: 'user_feedback',
    label: 'User Feedback',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    char_count: 850,
    source: 'user_input',
  },
  master_transcript: {
    variable_name: 'master_transcript',
    label: 'Master Transcript',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    char_count: 12400,
    source: 'tool',
  },
};

/**
 * Creates a copy of the mock context index with fresh timestamps
 */
export function createMockContextIndex(): ContextIndex {
  const now = Date.now();
  const entries = { ...MOCK_CONTEXT_INDEX };

  // Update timestamps to be relative to now
  Object.keys(entries).forEach((key, index) => {
    entries[key] = {
      ...entries[key],
      created_at: new Date(now - 86400000 * (7 - index)).toISOString(),
    };
  });

  return entries;
}

/**
 * Creates an empty context index
 */
export function createEmptyContextIndex(): ContextIndex {
  return {};
}

/**
 * Gets the total character count across all context entries
 */
export function getTotalContextSize(index: ContextIndex): number {
  return Object.values(index).reduce((sum, entry) => sum + entry.char_count, 0);
}

/**
 * Gets context entries sorted by creation date (newest first)
 */
export function getContextEntriesSorted(
  index: ContextIndex,
): Array<{ name: string; meta: ContextIndex[string] }> {
  return Object.entries(index)
    .map(([name, meta]) => ({ name, meta }))
    .sort(
      (a, b) =>
        new Date(b.meta.created_at).getTime() -
        new Date(a.meta.created_at).getTime(),
    );
}
