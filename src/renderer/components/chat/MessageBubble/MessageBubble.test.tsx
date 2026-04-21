import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react';
import MessageBubble from './MessageBubble';

jest.mock('../../../contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    navigateToFile: jest.fn(),
  }),
}));

jest.mock('../MessageActions', () => ({
  __esModule: true,
  default: () => null,
}));

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
    {
      shotNumber: 2,
      shotType: 'close-up',
      duration: 4,
      prompt:
        'Minnies face fills the frame as she glances at the framed photograph of her team before a subtle genuine smile slowly curves her lips.',
      cameraWork: 'static close-up with subtle drift right',
      dialogue: null,
      referenceImages: [],
    },
  ],
  totalSceneDuration: 10,
};

function buildMessage(content: string) {
  return {
    id: 'assistant-1',
    role: 'assistant' as const,
    type: 'agent_text',
    content,
    timestamp: Date.now(),
    author: 'Orchestrator',
  };
}

describe('MessageBubble', () => {
  it('renders a scene card for pure scene JSON', () => {
    render(
      React.createElement(MessageBubble, {
        message: buildMessage(JSON.stringify(sceneFixture)),
      }) as any,
    );

    expect(screen.getByText('Scene 6')).toBeTruthy();
    expect(screen.getByText('The Freedom')).toBeTruthy();
  });

  it('renders a scene card for scene JSON fragments without outer braces', () => {
    const fragment = `"sceneNumber":6,"sceneTitle":"The Freedom","shots":[{"shotNumber":1,"shotType":"establishing","duration":6,"prompt":"Morning sunlight streams through the large windows of the airy editing suite as the camera performs a smooth controlled dolly push-in revealing Minnie at the editing console.","cameraWork":"smooth dolly push-in from wide to medium","dialogue":null,"referenceImages":[]},{"shotNumber":2,"shotType":"close-up","duration":4,"prompt":"Minnies face fills the frame as she glances at the framed photograph of her team before a subtle genuine smile slowly curves her lips.","cameraWork":"static close-up with subtle drift right","dialogue":null,"referenceImages":[]}],"totalSceneDuration":10`;

    render(
      React.createElement(MessageBubble, {
        message: buildMessage(fragment),
      }) as any,
    );

    expect(screen.getByText('Scene 6')).toBeTruthy();
    expect(screen.getByText('The Freedom')).toBeTruthy();
  });

  it('suppresses duplicate prose when a scene JSON block is followed by a restatement', () => {
    const duplicateSummary = `${JSON.stringify(sceneFixture)} Scene 6: The Freedom (10s)

Shot 1 [establishing] (6s) Camera: smooth dolly push-in from wide to medium Prompt: Morning sunlight streams through the large windows of the airy editing suite as the camera performs a smooth controlled dolly push-in revealing Minnie at the editing console.

Shot 2 [close-up] (4s) Camera: static close-up with subtle drift right Prompt: Minnies face fills the frame as she glances at the framed photograph of her team before a subtle genuine smile slowly curves her lips.`;

    render(
      React.createElement(MessageBubble, {
        message: buildMessage(duplicateSummary),
      }) as any,
    );

    expect(screen.getByText('Scene 6')).toBeTruthy();
    expect(screen.queryByText(/Scene 6: The Freedom \(10s\)/)).toBeNull();
  });

  it('keeps genuinely extra text below the scene card', () => {
    const mixedContent = `${JSON.stringify(sceneFixture)}\n\nUse Scene 6 as the emotional release beat and keep the ending warm.`;

    render(
      React.createElement(MessageBubble, {
        message: buildMessage(mixedContent),
      }) as any,
    );

    expect(screen.getByText('Scene 6')).toBeTruthy();
    expect(
      screen.getByText(/Use Scene 6 as the emotional release beat/),
    ).toBeTruthy();
  });

  it('falls back to markdown for non-scene content', () => {
    render(
      React.createElement(MessageBubble, {
        message: buildMessage('Hello **world**'),
      }) as any,
    );

    expect(screen.getByText(/Hello/)).toBeTruthy();
    expect(screen.getByText(/world/)).toBeTruthy();
  });
});
