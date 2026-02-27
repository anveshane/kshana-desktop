import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  interpolateColors,
} from 'remotion';

interface InfographicProps {
  prompt: string;
  infographicType: string;
  data?: Record<string, unknown>;
}

export const Infographic1: React.FC<InfographicProps> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Configuration based on prompt
  const value = 250;
  const unit = 'KM/H';
  const redColor = '#e10600'; // F1 Red
  const darkGrey = '#334155';
  const radius = 130;
  const strokeWidth = 12;

  // Calculate circumference for stroke-dashoffset
  const circumference = 2 * Math.PI * radius;

  // Beat 1: Arc Animation (Frames 5-40)
  const arcProgress = interpolate(frame, [5, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const dashOffset = circumference * (1 - arcProgress);

  // Color transition: Dark Grey -> Vibrant Red
  const strokeColor = interpolateColors(
    frame,
    [5, 40],
    [darkGrey, redColor]
  );

  // Beat 2: Number Scale (Spring, Frames 10-50)
  // Prompt asks for 0.85 to 1.0 scale
  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 220, mass: 1 },
  });
  const scale = interpolate(scaleSpring, [0, 1], [0.85, 1.0]);

  // Beat 3: Emphasis & Kinetic Depth (Continuous)
  const glowIntensity = frame > 50
    ? interpolate(frame, [50, 70], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  // Subtle 3D tilt for "CSS Depth Illusion"
  const rotateY = Math.sin(frame * 0.03) * 4;

  return (
    <AbsoluteFill
      style={{
        background: 'transparent',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        perspective: '1200px', // Enable 3D space
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 500,
          padding: '40px 40px 60px 40px',
          borderRadius: '32px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 30px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0,0,0,0.2)',
          transform: `scale(${scale}) rotateY(${rotateY}deg)`,
          transformStyle: 'preserve-3d',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {/* Speedometer Arc Container */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: 0,
            right: 0,
            height: 220,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <svg width={340} height={220} viewBox="0 0 340 220">
            {/* Background Track (Subtle depth) */}
            <path
              d="M 40 170 A 130 130 0 0 1 300 170"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={strokeWidth + 4}
              strokeLinecap="round"
            />
            
            {/* Animated Arc */}
            <path
              d="M 40 170 A 130 130 0 0 1 300 170"
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                filter: `drop-shadow(0 0 ${8 + glowIntensity * 12}px ${redColor})`,
              }}
            />
          </svg>
        </div>

        {/* Typography Content */}
        <div style={{ marginTop: '80px' }}>
          <div
            style={{
              fontSize: '120px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1,
              marginBottom: '4px',
              letterSpacing: '-0.04em',
              textShadow: '0 10px 30px rgba(0,0,0,0.5)',
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontSize: '32px',
              fontWeight: 400,
              color: 'rgba(255, 255, 255, 0.6)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            {unit}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};