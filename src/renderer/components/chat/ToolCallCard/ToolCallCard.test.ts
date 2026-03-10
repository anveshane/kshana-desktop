import { describe, expect, it } from '@jest/globals';
import {
  isGenerationTool,
  isRoutineTool,
  prefersInlineTextPreview,
  shouldToolStartExpanded,
} from './ToolCallCard';

describe('ToolCallCard helpers', () => {
  it('treats read/list tools as routine', () => {
    expect(isRoutineTool('read_file')).toBe(true);
    expect(isRoutineTool('list_project_files')).toBe(true);
    expect(isRoutineTool('generate_content')).toBe(false);
  });

  it('treats generate tools as high-signal generation tools', () => {
    expect(isGenerationTool('generate_content')).toBe(false);
    expect(isGenerationTool('generate_image')).toBe(true);
    expect(isGenerationTool('read_file')).toBe(false);
  });

  it('keeps inline text previews for content-bearing write tools', () => {
    expect(prefersInlineTextPreview('import_file')).toBe(true);
    expect(prefersInlineTextPreview('generate_content')).toBe(true);
    expect(prefersInlineTextPreview('write_file')).toBe(true);
    expect(prefersInlineTextPreview('read_file')).toBe(false);
  });

  it('starts all non-running tools collapsed by default', () => {
    expect(shouldToolStartExpanded('read_file', 'completed')).toBe(false);
    expect(shouldToolStartExpanded('generate_content', 'completed')).toBe(false);
    expect(shouldToolStartExpanded('write_file', 'needs_confirmation')).toBe(
      false,
    );
    expect(shouldToolStartExpanded('generate_image', 'executing')).toBe(false);
  });
});
