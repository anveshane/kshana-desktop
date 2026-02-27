import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';

interface InfographicProps {
  prompt: string;
  infographicType: string;
  data?: Record<string, unknown>;
}

export const Infographic4: React.FC<InfographicProps> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const items = (data?.labels as string[]) || ['PRECISION', 'STRATEGY', 'PERFECTION'];

  return (
    <AbsoluteFill
      style={{
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ display: 'flex', gap: '60px', alignItems: 'center' }}>
        {items.map((label, i) => {
          const startFrame = i * 15;
          const localFrame = frame - startFrame;

          // Entrance animation: Scale springs from 0.92 to 1.0
          const scale = spring({
            frame: localFrame,
            fps,
            config: { damping: 200, mass: 1, stiffness: 100 },
          });
          
          // Opacity interpolation 0 to 1
          const opacity = interpolate(
            localFrame,
            [0, 20],
            [0, 1],
            { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
          );

          // Drop-shadow transition: Large/transparent to sharp/defined
          const shadowBlur = interpolate(
            localFrame,
            [0, 20],
            [40, 8],
            { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
          );
          const shadowOpacity = interpolate(
            localFrame,
            [0, 20],
            [0, 0.8],
            { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
          );

          // Active card entrance glow (cyan)
          const isActive = localFrame >= 0 && localFrame < 30;
          const glowOpacity = isActive
            ? interpolate(localFrame, [15, 25, 30], [0, 1, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
            : 0;

          return (
            <div
              key={i}
              style={{
                position: 'relative',
                padding: '24px 48px',
                borderRadius: '9999px', // Capsule shape
                background: 'radial-gradient(circle at 30% 30%, #1a1a1a, #0d0d0d)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '42px',
                fontWeight: 800,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                opacity,
                transform: `scale(${scale})`,
                boxShadow: `0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0,0,0,${shadowOpacity})`,
                border: glowOpacity > 0 
                  ? `1px solid rgba(0, 210, 255, ${glowOpacity})`
                  : '1px solid rgba(255, 255, 255, 0.1)',
                overflow: 'visible', // Allow glow to bleed out slightly if needed, though we use an inner element
              }}
            >
               {/* Inner shine/glow overlay */}
               {glowOpacity > 0 && (
                 <div
                   style={{
                     position: 'absolute',
                     inset: -2,
                     borderRadius: '9999px',
                     boxShadow: `0 0 20px rgba(0, 210, 255, ${glowOpacity * 0.6})`,
                     pointerEvents: 'none',
                     zIndex: -1,
                   }}
                 />
               )}

              <span
                style={{
                  background: 'linear-gradient(180deg, #e2e2e2, #999999)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
