import { describe, expect, it, jest } from '@jest/globals';
import {
  deriveContentArrivalState,
  deriveScrollFollowState,
  isViewportNearBottom,
} from './MessageList';

jest.mock('../MessageBubble', () => ({
  __esModule: true,
  default: () => null,
}));

describe('MessageList', () => {
  it('detects whether the viewport is anchored near the bottom', () => {
    expect(isViewportNearBottom(804, 1200, 300)).toBe(true);
    expect(isViewportNearBottom(500, 1200, 300)).toBe(false);
  });

  it('disables auto-follow when the user scrolls upward away from the bottom', () => {
    expect(
      deriveScrollFollowState({
        scrollTop: 200,
        previousScrollTop: 800,
        scrollHeight: 1200,
        clientHeight: 300,
        isAutoFollowEnabled: true,
        hasUnreadBelow: false,
      }),
    ).toEqual({
      isAutoFollowEnabled: false,
      hasUnreadBelow: false,
    });
  });

  it('marks unread content below when new transcript content arrives while follow is off', () => {
    expect(
      deriveContentArrivalState({
        isAutoFollowEnabled: false,
        scrollTop: 200,
        scrollHeight: 1200,
        clientHeight: 300,
      }),
    ).toEqual({
      isAutoFollowEnabled: false,
      hasUnreadBelow: true,
    });
  });

  it('clears unread state when the viewport is back near the bottom', () => {
    expect(
      deriveScrollFollowState({
        scrollTop: 905,
        previousScrollTop: 700,
        scrollHeight: 1200,
        clientHeight: 300,
        isAutoFollowEnabled: false,
        hasUnreadBelow: true,
      }),
    ).toEqual({
      isAutoFollowEnabled: true,
      hasUnreadBelow: false,
    });
  });
});
