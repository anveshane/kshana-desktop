import { describe, expect, it } from '@jest/globals';
import { shouldToolStartExpanded } from './ToolCallCard';

describe('ToolCallCard', () => {
  it('starts collapsed by default', () => {
    expect(shouldToolStartExpanded()).toBe(false);
  });
});
