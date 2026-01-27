/**
 * PlaybackStateMachine - Production-grade state machine for playback control
 * Handles all state transitions without boundary checks
 * Single source of truth for what should be playing
 */

import type { TimelineItem } from '../hooks/useTimelineData';
import { TimeIndex, type TimeRange } from './TimeIndex';

export type PlaybackState =
  | { type: 'IDLE' }
  | { type: 'PLAYING'; itemIndex: number; item: TimelineItem }
  | { type: 'TRANSITIONING'; fromIndex: number; toIndex: number }
  | { type: 'SEEKING'; targetTime: number }
  | { type: 'PAUSED'; itemIndex: number; item: TimelineItem };

export class PlaybackStateMachine {
  private state: PlaybackState = { type: 'IDLE' };
  private timeIndex: TimeIndex;
  private lastItemIndex: number | null = null;

  constructor(timeIndex: TimeIndex) {
    this.timeIndex = timeIndex;
  }

  /**
   * Update state based on playback time - no boundary checks needed
   * TimeIndex handles all time-based lookups
   */
  update(
    playbackTime: number,
    isPlaying: boolean,
    isSeeking: boolean,
  ): PlaybackState {
    if (isSeeking) {
      this.state = { type: 'SEEKING', targetTime: playbackTime };
      return this.state;
    }

    const item = this.timeIndex.findItemAtTime(playbackTime);
    let itemIndex = item ? this.timeIndex.getItemIndexAtTime(playbackTime) : null;
    
    // If itemIndex is null but we have an item, try to get index from item ID
    // This handles cases where TimeIndex returns an item but index lookup fails
    if (item && itemIndex === null) {
      itemIndex = this.timeIndex.getItemIndex(item);
    }

    if (!item || itemIndex === null) {
      // No item at this time - could be gap or end of timeline
      if (this.state.type === 'PLAYING') {
        this.state = { type: 'IDLE' };
        this.lastItemIndex = null;
      }
      return this.state;
    }

    // Handle state transitions
    if (this.state.type === 'PLAYING') {
      if (this.state.itemIndex !== itemIndex) {
        // Transitioning to new item
        this.state = {
          type: 'TRANSITIONING',
          fromIndex: this.state.itemIndex,
          toIndex: itemIndex,
        };
        // Immediately transition to playing new item
        this.state = {
          type: 'PLAYING',
          itemIndex,
          item,
        };
        this.lastItemIndex = itemIndex;
      }
      // Otherwise, continue playing same item
    } else if (this.state.type === 'PAUSED') {
      if (this.state.itemIndex !== itemIndex) {
        // Item changed while paused (e.g., seek)
        this.state = { type: 'PAUSED', itemIndex, item };
        this.lastItemIndex = itemIndex;
      }
      // Otherwise, continue paused on same item
    } else if (this.state.type === 'SEEKING') {
      // Seeking completed, transition to appropriate state
      this.state = isPlaying
        ? { type: 'PLAYING', itemIndex, item }
        : { type: 'PAUSED', itemIndex, item };
      this.lastItemIndex = itemIndex;
    } else {
      // IDLE or TRANSITIONING - start playing/pausing
      this.state = isPlaying
        ? { type: 'PLAYING', itemIndex, item }
        : { type: 'PAUSED', itemIndex, item };
      this.lastItemIndex = itemIndex;
    }

    return this.state;
  }

  /**
   * Get current item (if playing or paused)
   */
  getCurrentItem(): TimelineItem | null {
    if (this.state.type === 'PLAYING' || this.state.type === 'PAUSED') {
      return this.state.item;
    }
    return null;
  }

  /**
   * Get current item index (if playing or paused)
   */
  getCurrentItemIndex(): number | null {
    if (this.state.type === 'PLAYING' || this.state.type === 'PAUSED') {
      return this.state.itemIndex;
    }
    return null;
  }

  /**
   * Get current state
   */
  getCurrentState(): PlaybackState {
    return this.state;
  }

  /**
   * Reset state machine
   */
  reset(): void {
    this.state = { type: 'IDLE' };
    this.lastItemIndex = null;
  }
}
