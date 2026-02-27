import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';

interface InfographicProps {
  prompt: string;
  infographicType: string;
  data?: Record<string, unknown>;
}

export const Infographic2: React.FC<InfographicProps> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Beat 1: Depth Reveal Entrance (Scale 0.94 -> 1.0)
  // Using spring with high damping for smooth, non-bouncy arrival
  const entranceSpring = spring({
    frame,
    fps,
    config: { damping: 220, stiffness: 100, mass: 1 },
  });

  // Map spring 0->1 to scale 0.94->1.0
  const scale = interpolate(entranceSpring, [0, 1], [0.94, 1.0], {
    extrapolateRight: 'clamp',
  });

  const opacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  // Beat 2: Stopwatch Counter Animation
  // Interpolates rapidly from 3.000s down to 2.000s
  const counterStart = 10; // Start counting shortly after entrance begins
  const counterEnd = 70;  // Finish quickly to feel "rapid"
  
  const rawValue = interpolate(
    frame,
    [counterStart, counterEnd],
    [3.000, 2.000],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );

  // Format to 3 decimal places for high-tech stopwatch feel
  const displayValue = rawValue.toFixed(3);

  // Tech Grid Background Pattern using CSS Gradients
  const gridPattern = `
    linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px)
  `;

  return (
    <AbsoluteFill style={{ background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: '680px',
          padding: '70px 80px',
          borderRadius: '28px',
          // Dark semi-transparent glassmorphism
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 58, 138, 0.75))',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          // Layered shadow for depth
          boxShadow: `
            0 30px 60px rgba(0, 0, 0, 0.6),
            0 0 0 1px rgba(56, 189, 248, 0.1) inset,
            0 0 50px rgba(56, 189, 248, 0.1)
          `,
          // Apply Depth Reveal Scale
          transform: `scale(${scale})`,
          opacity: opacity,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Technical Grid Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: gridPattern,
            backgroundSize: '32px 32px',
            pointerEvents: 'none',
            maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
            opacity: 0.6,
          }}
        />

        {/* Content Layer */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          
          {/* Label Header */}
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '5px',
              textTransform: 'uppercase',
              color: '#38bdf8', // Sky blue accent
              opacity: 0.9,
              textShadow: '0 0 10px rgba(56, 189, 248, 0.4)',
            }}
          >
            Lap Timer
          </div>

          {/* Main Counter Display */}
          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '160px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
              // Cinematic Glow on the numbers
              textShadow: `
                0 0 20px rgba(255, 255, 255, 0.5),
                0 0 40px rgba(56, 189, 248, 0.4),
                0 0 80px rgba(56, 189, 248, 0.2)
              `,
            }}
          >
            {displayValue}
          </div>

          {/* Unit / Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
            <div style={{ height: '1px', width: '40px', background: 'rgba(56, 189, 248, 0.4)' }} />
            <div
              style={{
                fontSize: '24px',
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.7)',
                letterSpacing: '2px',
              }}
            >
              SECONDS
            </div>
            <div style={{ height: '1px', width: '40px', background: 'rgba(56, 189, 248, 0.4)' }} />
          </div>

          {/* Decorative Tech SVG Icon */}
          <div style={{ marginTop: '20px', opacity: 0.7 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};