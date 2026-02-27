import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export interface AnimationHints {
  ruleRefs?: string[];
  suggestion?: string;
  timingCurve?: 'linear' | 'spring' | 'ease';
  enhancedPrompt?: string;
}

export interface InfographicProps {
  prompt: string;
  infographicType: string;
  animationHints?: AnimationHints;
}

export const Infographic: React.FC<InfographicProps> = ({ prompt, infographicType, animationHints }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Use enhancedPrompt if available, otherwise use original prompt
  const displayPrompt = animationHints?.enhancedPrompt || prompt;
  
  // Determine animation curve from hints (default to spring for smooth entrance)
  const timingCurve = animationHints?.timingCurve || 'spring';
  
  // Calculate opacity and scale based on timing curve
  let opacity = 1;
  let scale = 1;
  let translateY = 0;
  
  // Animate over first 1.5 seconds for smooth entrance
  const animationDurationFrames = Math.round(1.5 * fps);
  
  if (timingCurve === 'spring') {
    // Spring animation: smooth entrance with natural motion
    opacity = spring({
      frame,
      fps,
      config: { damping: 200 }, // Smooth, no bounce
    });
    scale = spring({
      frame,
      fps,
      config: { damping: 200 },
    });
    // Subtle upward motion
    translateY = interpolate(
      spring({
        frame,
        fps,
        config: { damping: 200 },
      }),
      [0, 1],
      [20, 0],
      { extrapolateRight: 'clamp' }
    );
  } else if (timingCurve === 'ease') {
    // Ease animation: smooth ease-in-out with scale
    opacity = interpolate(
      frame,
      [0, animationDurationFrames],
      [0, 1],
      {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
        easing: (t) => t * t * (3 - 2 * t), // smoothstep easing
      }
    );
    scale = interpolate(
      frame,
      [0, animationDurationFrames],
      [0.85, 1],
      {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
        easing: (t) => t * t * (3 - 2 * t),
      }
    );
    translateY = interpolate(
      frame,
      [0, animationDurationFrames],
      [30, 0],
      {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
        easing: (t) => t * t * (3 - 2 * t),
      }
    );
  } else {
    // Linear animation: simple fade in with slight scale
    opacity = interpolate(
      frame,
      [0, animationDurationFrames],
      [0, 1],
      {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
      }
    );
    scale = interpolate(
      frame,
      [0, animationDurationFrames],
      [0.9, 1],
      {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
      }
    );
    translateY = interpolate(
      frame,
      [0, animationDurationFrames],
      [20, 0],
      {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
      }
    );
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 48,
      }}
    >
      <div
        style={{
          fontFamily: 'system-ui, sans-serif',
          color: '#f1f5f9',
          fontSize: 28,
          maxWidth: 900,
          textAlign: 'center',
          lineHeight: 1.4,
          opacity,
          transform: `scale(${scale}) translateY(${translateY}px)`,
          willChange: 'opacity, transform', // Optimize for animation
        }}
      >
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase' }}>
          {infographicType}
        </div>
        {displayPrompt}
      </div>
    </AbsoluteFill>
  );
};
