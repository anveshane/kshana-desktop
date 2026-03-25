import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, jest } from '@jest/globals';
import QuestionPrompt from './QuestionPrompt';

describe('QuestionPrompt auto-approve', () => {
  it('submits the first option when timeout expires without an explicit default', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    render(
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Other' }]}
        type="select"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).toHaveBeenCalledWith('Proceed');
    jest.useRealTimers();
  });

  it('prefers the explicit default option over the first option', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    render(
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Skip' }]}
        type="select"
        defaultOption="Skip"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).toHaveBeenCalledWith('Skip');
    jest.useRealTimers();
  });

  it('does not auto-submit free-text questions without a default', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    render(
      <QuestionPrompt
        question="Tell me more"
        type="text"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('stops auto-submit when the timeout is removed mid-countdown', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    const { queryByText, rerender } = render(
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Other' }]}
        type="select"
        autoApproveTimeoutMs={2000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    rerender(
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Other' }]}
        type="select"
        onSelect={onSelect}
      />,
    );

    expect(queryByText(/Auto-approving in/i)).toBeNull();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onSelect).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('submits immediately when an option is clicked', async () => {
    const onSelect = jest.fn();

    const { findByRole } = render(
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Other' }]}
        type="select"
        autoApproveTimeoutMs={5000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});
    fireEvent.click(await findByRole('button', { name: /Proceed/i }));

    expect(onSelect).toHaveBeenCalledWith('Proceed');
  });

  it('submits immediately when a numeric shortcut is pressed', async () => {
    const onSelect = jest.fn();

    render(
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Other' }]}
        type="select"
        autoApproveTimeoutMs={5000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});
    fireEvent.keyDown(window, { key: '2' });

    expect(onSelect).toHaveBeenCalledWith('Other');
  });
});
