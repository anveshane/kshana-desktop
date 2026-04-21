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

  it('renders mixed scene output as a scene card without duplicate prose', () => {
    const sceneFixture = {
      sceneNumber: 6,
      sceneTitle: 'The Freedom',
      shots: [
        {
          shotNumber: 1,
          shotType: 'establishing',
          duration: 6,
          prompt:
            'Morning sunlight streams through the large windows of the airy editing suite as the camera performs a smooth controlled dolly push-in revealing Minnie at the editing console.',
          cameraWork: 'smooth dolly push-in from wide to medium',
          dialogue: null,
          referenceImages: [],
        },
      ],
      totalSceneDuration: 10,
    };

    const mixedStreamingContent = `${JSON.stringify(sceneFixture)} Scene 6: The Freedom (10s)

Shot 1 [establishing] (6s) Camera: smooth dolly push-in from wide to medium Prompt: Morning sunlight streams through the large windows of the airy editing suite as the camera performs a smooth controlled dolly push-in revealing Minnie at the editing console.`;

    render(
      React.createElement(ToolCallCard, {
        toolName: 'generate_content',
        status: 'executing',
        streamingContent: mixedStreamingContent,
      }) as any,
    );

    expect(screen.getByText('Scene 6')).toBeTruthy();
    expect(screen.queryByText(/Scene 6: The Freedom \(10s\)/)).toBeNull();
  });
});
