import React from "react";
import { Flag, X } from "lucide-react";
import type { Marker } from "@openreel/core";

interface MarkerIndicatorProps {
  marker: Marker;
  pixelsPerSecond: number;
  scrollX: number;
  onSeek?: (time: number) => void;
  onRemove?: (markerId: string) => void;
  onUpdate?: (markerId: string, updates: Partial<Marker>) => void;
}

export const MarkerIndicator: React.FC<MarkerIndicatorProps> = ({
  marker,
  pixelsPerSecond,
  scrollX,
  onSeek,
  onRemove,
  onUpdate,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedLabel, setEditedLabel] = React.useState(marker.label);

  const x = marker.time * pixelsPerSecond - scrollX;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSeek) {
      onSeek(marker.time);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(marker.id);
    }
  };

  const handleLabelChange = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (onUpdate && editedLabel.trim()) {
        onUpdate(marker.id, { label: editedLabel.trim() });
      }
      setIsEditing(false);
    } else if (e.key === "Escape") {
      setEditedLabel(marker.label);
      setIsEditing(false);
    }
  };

  return (
    <div
      className="absolute top-0 bottom-0 flex flex-col items-center cursor-pointer z-20"
      style={{ left: `${x}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="w-0.5 h-full transition-opacity"
        style={{
          backgroundColor: marker.color,
          opacity: isHovered ? 1 : 0.6,
        }}
      />

      <div
        className="absolute top-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap transition-all shadow-lg"
        style={{
          backgroundColor: marker.color,
          color: "#fff",
          transform: isHovered ? "scale(1.05)" : "scale(1)",
        }}
      >
        <Flag size={10} />
        {isEditing ? (
          <input
            type="text"
            value={editedLabel}
            onChange={(e) => setEditedLabel(e.target.value)}
            onKeyDown={handleLabelChange}
            onBlur={() => {
              setEditedLabel(marker.label);
              setIsEditing(false);
            }}
            className="bg-transparent border-none outline-none text-white w-20 px-1"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span>{marker.label}</span>
        )}
        {isHovered && onRemove && (
          <button
            onClick={handleRemove}
            className="ml-1 hover:bg-white/20 rounded p-0.5 transition-colors"
          >
            <X size={10} />
          </button>
        )}
      </div>
    </div>
  );
};
