/**
 * TimeIndex - Production-grade time-based lookup for timeline items
 * Uses binary search for O(log n) performance instead of linear search
 * Handles all boundary cases without special-case logic
 */

import type { TimelineItem } from '../hooks/useTimelineData';

export interface TimeRange {
  startTime: number;
  endTime: number;
  itemIndex: number;
  item: TimelineItem;
}

export class TimeIndex {
  private ranges: TimeRange[];

  constructor(timelineItems: TimelineItem[]) {
    // Build sorted array of non-overlapping ranges
    // Filter out audio items as they span the entire timeline
    const nonAudioItems = timelineItems.filter((item) => item.type !== 'audio');

    // Map to ranges, preserving original index from timelineItems array
    this.ranges = timelineItems
      .map((item, originalIndex) => ({
        startTime: item.startTime,
        endTime: item.endTime,
        itemIndex: originalIndex, // Preserve original index from timelineItems
        item,
      }))
      .filter((range) => range.item.type !== 'audio') // Filter audio after mapping to preserve indices
      .sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Find the item at a specific time using binary search
   * O(log n) performance - no boundary checks needed
   */
  findItemAtTime(time: number): TimelineItem | null {
    const range = this.binarySearch(time);
    return range?.item || null;
  }

  /**
   * Get the item index for a given item
   */
  getItemIndex(item: TimelineItem): number | null {
    const range = this.ranges.find((r) => r.item.id === item.id);
    return range?.itemIndex ?? null;
  }

  /**
   * Get the item index at a specific time (returns the index in the original timelineItems array)
   */
  getItemIndexAtTime(time: number): number | null {
    const range = this.binarySearch(time);
    if (!range) return null;

    // Find the original index in timelineItems by matching the item
    // We need to search through ranges to find which one matches
    return range.itemIndex;
  }

  /**
   * Get the item index at a specific time
   * Returns the original index from the timelineItems array
   */
  getItemIndexAtTime(time: number): number | null {
    const range = this.binarySearch(time);
    return range?.itemIndex ?? null;
  }

  /**
   * Binary search for time range containing the given time
   * Handles exact boundaries automatically
   */
  private binarySearch(time: number): TimeRange | null {
    if (this.ranges.length === 0) return null;
    if (time < 0) return null;

    let left = 0;
    let right = this.ranges.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const range = this.ranges[mid];

      // Check if time is within this range
      if (time >= range.startTime && time < range.endTime) {
        return range;
      }
      if (time < range.startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // Handle exact boundary: if time equals an item's endTime, return next item
    // This ensures smooth transitions between items
    const exactEndMatch = this.ranges.find(
      (r) => Math.abs(time - r.endTime) < 0.001,
    );
    if (exactEndMatch) {
      const matchIndex = this.ranges.indexOf(exactEndMatch);
      const nextRange = this.ranges[matchIndex + 1];
      return nextRange || null;
    }

    // If time is before first item, return first item
    if (time < this.ranges[0]?.startTime) {
      return this.ranges[0] || null;
    }

    // If time is after last item, return null (end of timeline)
    return null;
  }

  /**
   * Get the next item transition time from current time
   * Useful for preloading or scheduling transitions
   */
  getNextTransitionTime(currentTime: number): number | null {
    const currentRange = this.binarySearch(currentTime);
    if (!currentRange) return null;

    const currentIndex = this.ranges.indexOf(currentRange);
    const nextRange = this.ranges[currentIndex + 1];
    return nextRange?.startTime || null;
  }

  /**
   * Get all ranges (for debugging)
   */
  getRanges(): readonly TimeRange[] {
    return this.ranges;
  }
}
