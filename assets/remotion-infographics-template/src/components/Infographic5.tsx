import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { random } from 'remotion';

interface InfographicProps {
  prompt: string;
  infographicType: string;
  data?: Record<string, unknown>;
}

export const Infographic5: React.FC<InfographicProps> = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Beat 1: Kinetic Typography Slam (Frames 0-20)
  // Configured for high impact: stiffness 350, damping 18 for the "slam" effect
  const slamSpring = spring({
    frame,
    fps,
    config: { stiffness: 350, damping: 18 },
  });

  // Scale from 0 to 1.08 (overshoot) then settle at 1.0
  const scale = interpolate(slamSpring, [0, 0.9, 1], [0, 1.08, 1.0]);

  // Digital Glitch Effect (Entry frames 0-12)
  const isGlitching = frame < 12;
  const glitchOffset = isGlitching
    ? Math.sin(frame * 1.5) * (interpolate(frame, [0, 12], [20, 0], { extrapolateRight: 'clamp' }))
    : 0;
  const rgbShift = isGlitching
    ? interpolate(frame, [0, 12], [10, 0], { extrapolateRight: 'clamp' })
    : 0;

  // Rhythmic Neon Cyan Glow Pulse
  const pulsePhase = Math.max(0, frame - 10);
  const pulseRadius = pulsePhase > 0
    ? 25 + Math.sin(pulsePhase * 0.15) * 8
    : 25;

  // Beat 2: Subtitle Reveal (Starts Frame 20)
  const subtitleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic)
  });
  const subtitleScale = interpolate(frame, [20, 40], [0.95, 1.0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic)
  });

  // Procedural Abstract Light Streaks (Canvas-like logic)
  const streaks = Array.from({ length: 16 }, (_, i) => {
    const seed = `streak-${i}`;
    const speed = 15 + random(seed) * 20;
    const yPos = (height / 16) * i + 20 + random(seed + 'y') * 40;
    const streakLength = 150 + random(seed + 'l') * 400;
    const xOffset = random(seed + 'off') * 200;
    const opacityBase = 0.05 + random(seed + 'op') * 0.1;
    
    // Continuous horizontal streaking
    const xPos = ((frame * speed + xOffset) % (width + streakLength)) - (streakLength / 2);
    const opacity = opacityBase + Math.sin(frame * 0.05 + i) * 0.03;
    const thickness = 1 + (i % 4);

    return { x: xPos, y: yPos, l: streakLength, w: thickness, o: opacity };
  });

  return (
    <AbsoluteFill
      style={{
        background: 'transparent',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      {/* Procedural Light Streaks Layer */}
      <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 0 }}>
        {streaks.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: s.x,
              top: s.y,
              width: s.l,
              height: s.w,
              background: `linear-gradient(90deg, transparent, rgba(0, 212, 255, ${s.o}), transparent)`,
              transform: `skewX(-15deg)`,
              filter: 'blur(2px)',
              mixBlendMode: 'screen'
            }}
          />
        ))}
      </AbsoluteFill>

      {/* Main Typography Container */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          textAlign: 'center',
          transform: `scale(${scale}) translateX(${glitchOffset}px)`,
          perspective: '1000px'
        }}
      >
        {/* Main Text: 1 MILLISECOND */}
        <h1
          style={{
            fontSize: '160px',
            fontWeight: 900,
            color: '#ffffff',
            margin: 0,
            lineHeight: 0.9,
            letterSpacing: '-0.04em',
            whiteSpace: 'nowrap',
            // CSS 3D Depth Illusion
            transform: `rotateX(${Math.sin(frame * 0.02) * 3}deg)`,
            // Neon Cyan Text Shadow + RGB Shift for Glitch
            textShadow: `
              ${rgbShift}px 0 ${pulseRadius}px rgba(255, 0, 0, 0.7),
              ${-rgbShift}px 0 ${pulseRadius}px rgba(0, 255, 255, 0.7),
              0 0 ${pulseRadius * 1.5}px #00d4ff,
              0 0 ${pulseRadius * 3}px #00d4ff
            `
          }}
        >
          1 MILLISECOND
        </h1>
      </div>

      {/* Subtitle: DECIDES THE WINNER */}
      <div
        style={{
          position: 'absolute',
          top: '65%',
          width: '100%',
          textAlign: 'center',
          opacity: subtitleOpacity,
          transform: `scale(${subtitleScale})`,
          zIndex: 10
        }}
      >
        <div
          style={{
            fontSize: '48px',
            fontWeight: 800,
            color: '#ffffff',
            textTransform: 'uppercase',
            letterSpacing: '0.25em',
            textShadow: '0 4px 12px rgba(0,0,0,0.9)',
            padding: '0 60px'
          }}
        >
          Decides The Winner
        </div>
      </div>
    </AbsoluteFill>
  );
};