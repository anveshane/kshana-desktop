import { useState } from 'react';
import type { TimelineMarker as TimelineMarkerType } from '../../../types/projectState';
import styles from './TimelineMarker.module.scss';

interface TimelineMarkerProps {
  marker: TimelineMarkerType;
  position: number; // in pixels
}

export default function TimelineMarker({ marker, position }: TimelineMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);

  const getStatusColor = () => {
    switch (marker.status) {
      case 'pending':
        return styles.pending;
      case 'processing':
        return styles.processing;
      case 'complete':
        return styles.complete;
      case 'error':
        return styles.error;
      default:
        return styles.pending;
    }
  };

  const isPulsing = marker.status === 'processing';

  return (
    <div
      className={`${styles.marker} ${getStatusColor()} ${isPulsing ? styles.pulsing : ''}`}
      style={{ left: `${position}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.markerFlag} />
      {isHovered && (
        <div className={styles.markerTooltip}>
          <div className={styles.tooltipStatus}>
            Status: <span className={styles.statusText}>{marker.status}</span>
          </div>
          <div className={styles.tooltipPrompt}>{marker.prompt}</div>
        </div>
      )}
    </div>
  );
}

