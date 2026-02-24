import React from "react";
import type { Subtitle } from "@openreel/core";

interface SubtitleClipProps {
  subtitle: Subtitle;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: (id: string, addToSelection: boolean) => void;
}

export const SubtitleClip: React.FC<SubtitleClipProps> = ({
  subtitle,
  pixelsPerSecond,
  isSelected,
  onSelect,
}) => {
  const width = (subtitle.endTime - subtitle.startTime) * pixelsPerSecond;
  const left = subtitle.startTime * pixelsPerSecond;

  return (
    <div
      className={`absolute top-1 bottom-1 rounded px-2 py-0.5 cursor-pointer transition-all group ${
        isSelected
          ? "bg-purple-500/40 border-2 border-purple-400"
          : "bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30"
      }`}
      style={{ left, width: Math.max(width, 30) }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(subtitle.id, e.metaKey || e.ctrlKey);
      }}
    >
      <p className="text-[9px] text-purple-200 truncate leading-tight">
        {subtitle.text}
      </p>
    </div>
  );
};
