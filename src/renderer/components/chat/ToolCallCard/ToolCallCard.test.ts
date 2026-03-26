import { describe, expect, it } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react';
import ToolCallCard, { shouldToolStartExpanded } from './ToolCallCard';

describe('ToolCallCard', () => {
  it('starts collapsed by default', () => {
    expect(shouldToolStartExpanded()).toBe(false);
  });

  it('shows live streaming content while a tool is executing', () => {
    render(
      React.createElement(ToolCallCard, {
        toolName: 'generate_content',
        status: 'executing',
        streamingContent: 'Loading workflow...\nQueued (1 job ahead)',
      }) as any,
    );

    expect(screen.getByText('Live output')).toBeTruthy();
    expect(screen.getByText(/Loading workflow/)).toBeTruthy();
    expect(screen.getByText(/Queued \(1 job ahead\)/)).toBeTruthy();
  });

  it('renders progress-style tool streams in the tool card', () => {
    render(
      React.createElement(ToolCallCard, {
        toolName: 'generate_content',
        status: 'executing',
        streamingContent: 'Loading workflow...\nStep 4/9 (44%)\nProcessing node 3',
      }) as any,
    );

    expect(screen.getByText('Live output')).toBeTruthy();
    expect(screen.getByText(/Step 4\/9 \(44%\)/)).toBeTruthy();
    expect(screen.getByText(/Processing node 3/)).toBeTruthy();
  });
});
