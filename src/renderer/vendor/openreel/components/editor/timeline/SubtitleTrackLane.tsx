import React, { useRef, useCallback } from "react";
import type { Subtitle } from "@openreel/core";
import { SubtitleClip } from "./SubtitleClip";

interface SubtitleTrackLaneProps {
  subtitles: Subtitle[];
  pixelsPerSecond: number;
  selectedSubtitleIds: string[];
  onSelectSubtitle: (id: string, addToSelection: boolean) => void;
  onAddSubtitle: (startTime: number) => void;
  scrollX: number;
}

export const SubtitleTrackLane: React.FC<SubtitleTrackLaneProps> = ({
  subtitles,
  pixelsPerSecond,
  selectedSubtitleIds,
  onSelectSubtitle,
  onAddSubtitle,
  scrollX,
}) => {
  const laneRef = useRef<HTMLDivElement>(null);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = laneRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + scrollX;
      const startTime = Math.max(0, x / pixelsPerSecond);
      onAddSubtitle(startTime);
    },
    [scrollX, pixelsPerSecond, onAddSubtitle],
  );

  return (
    <div
      ref={laneRef}
      className="h-10 border-b border-border/50 relative bg-purple-500/5"
      onDoubleClick={handleDoubleClick}
    >
      {subtitles.map((subtitle) => (
        <SubtitleClip
          key={subtitle.id}
          subtitle={subtitle}
          pixelsPerSecond={pixelsPerSecond}
          isSelected={selectedSubtitleIds.includes(subtitle.id)}
          onSelect={onSelectSubtitle}
        />
      ))}
      {subtitles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] text-purple-400/50">
            Double-click to add subtitle
          </span>
        </div>
      )}
    </div>
  );
};
