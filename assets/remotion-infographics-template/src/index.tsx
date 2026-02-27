import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Infographic1 } from './components/Infographic1';
import { Infographic2 } from './components/Infographic2';
import { Infographic3 } from './components/Infographic3';
import { Infographic4 } from './components/Infographic4';
import { Infographic5 } from './components/Infographic5';

const fps = 24;

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Infographic1"
        // @ts-ignore - Remotion Composition expects Record<string, unknown> but components use InfographicProps
        component={Infographic1}
        durationInFrames={5 * fps}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{
          prompt: '',
          infographicType: 'statistic',
          data: {},
        }}
      />
      <Composition
        id="Infographic2"
        // @ts-ignore - Remotion Composition expects Record<string, unknown> but components use InfographicProps
        component={Infographic2}
        durationInFrames={5 * fps}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{
          prompt: '',
          infographicType: 'statistic',
          data: {},
        }}
      />
      <Composition
        id="Infographic3"
        // @ts-ignore - Remotion Composition expects Record<string, unknown> but components use InfographicProps
        component={Infographic3}
        durationInFrames={5 * fps}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{
          prompt: '',
          infographicType: 'statistic',
          data: {},
        }}
      />
      <Composition
        id="Infographic4"
        // @ts-ignore - Remotion Composition expects Record<string, unknown> but components use InfographicProps
        component={Infographic4}
        durationInFrames={5 * fps}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{
          prompt: '',
          infographicType: 'statistic',
          data: {},
        }}
      />
      <Composition
        id="Infographic5"
        // @ts-ignore - Remotion Composition expects Record<string, unknown> but components use InfographicProps
        component={Infographic5}
        durationInFrames={5 * fps}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{
          prompt: '',
          infographicType: 'statistic',
          data: {},
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
