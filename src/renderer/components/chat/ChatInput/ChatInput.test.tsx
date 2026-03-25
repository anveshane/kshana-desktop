import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, jest } from '@jest/globals';
import ChatInput from './ChatInput';

describe('ChatInput', () => {
  it('treats early composer engagement as question interaction', () => {
    const onQuestionInteraction = jest.fn();

    render(
      <ChatInput
        questionMode
        onQuestionInteraction={onQuestionInteraction}
        onSend={jest.fn()}
      />,
    );

    const textarea = screen.getByLabelText('Chat input');

    fireEvent.focus(textarea);
    fireEvent.click(textarea);
    fireEvent.keyDown(textarea, { key: 'a' });
    fireEvent.change(textarea, { target: { value: 'hello' } });

    expect(onQuestionInteraction).toHaveBeenCalledTimes(4);
  });

  it('does not report question interaction outside question mode', () => {
    const onQuestionInteraction = jest.fn();

    render(
      <ChatInput
        onQuestionInteraction={onQuestionInteraction}
        onSend={jest.fn()}
      />,
    );

    const textarea = screen.getByLabelText('Chat input');

    fireEvent.focus(textarea);
    fireEvent.click(textarea);
    fireEvent.keyDown(textarea, { key: 'a' });
    fireEvent.change(textarea, { target: { value: 'hello' } });

    expect(onQuestionInteraction).not.toHaveBeenCalled();
  });
});
