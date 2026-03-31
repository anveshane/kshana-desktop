import { describe, expect, it } from '@jest/globals';
import {
  isDuplicateSceneSummary,
  parseSceneContent,
  tryParseSceneData,
} from './SceneCard';

const sceneFixture = {
  sceneNumber: 6,
  sceneTitle: 'The Freedom',
  shots: [
    {
      shotNumber: 1,
      shotType: 'establishing',
      duration: 6,
      prompt:
        'Morning sunlight streams through the large windows of the airy editing suite as the camera performs a smooth controlled dolly push-in revealing Minnie at the editing console.',
      cameraWork: 'smooth dolly push-in from wide to medium',
      dialogue: null,
      referenceImages: [],
    },
    {
      shotNumber: 2,
      shotType: 'close-up',
      duration: 4,
      prompt:
        'Minnies face fills the frame as she glances at the framed photograph of her team before a subtle genuine smile slowly curves her lips.',
      cameraWork: 'static close-up with subtle drift right',
      dialogue: null,
      referenceImages: [],
    },
  ],
  totalSceneDuration: 10,
};

describe('SceneCard scene parsing', () => {
  it('parses pure scene JSON', () => {
    expect(tryParseSceneData(JSON.stringify(sceneFixture))).toEqual(sceneFixture);
  });

  it('parses scene JSON emitted without outer braces', () => {
    const fragment = `"sceneNumber":6,"sceneTitle":"The Freedom","shots":[{"shotNumber":1,"shotType":"establishing","duration":6,"prompt":"Morning sunlight streams through the large windows of the airy editing suite as the camera performs a smooth controlled dolly push-in revealing Minnie at the editing console.","cameraWork":"smooth dolly push-in from wide to medium","dialogue":null,"referenceImages":[]},{"shotNumber":2,"shotType":"close-up","duration":4,"prompt":"Minnies face fills the frame as she glances at the framed photograph of her team before a subtle genuine smile slowly curves her lips.","cameraWork":"static close-up with subtle drift right","dialogue":null,"referenceImages":[]}],"totalSceneDuration":10`;

    expect(tryParseSceneData(fragment)).toEqual(sceneFixture);
  });

  it('parses scene JSON wrapped in a fenced code block', () => {
    const fenced = `\`\`\`json
${JSON.stringify(sceneFixture, null, 2)}
\`\`\``;

    expect(tryParseSceneData(fenced)).toEqual(sceneFixture);
  });

  it('extracts scene JSON embedded in mixed content', () => {
    const mixedContent = `${JSON.stringify(sceneFixture)} Scene 6: The Freedom (10s)\n\nShot 1 [establishing] (6s) Camera: smooth dolly push-in from wide to medium Prompt: Morning sunlight streams through the large windows of the airy editing suite as the camera performs a smooth controlled dolly push-in revealing Minnie at the editing console.`;

    const parsed = parseSceneContent(mixedContent);

    expect(parsed?.sceneData).toEqual(sceneFixture);
    expect(parsed?.leadingText).toBe('');
    expect(parsed?.trailingText).toContain('Scene 6: The Freedom');
  });

  it('returns null for malformed or unrelated content', () => {
    expect(parseSceneContent('Scene 6 is great but this is not JSON.')).toBeNull();
    expect(parseSceneContent('{"sceneNumber":"6"}')).toBeNull();
  });

  it('detects when trailing text is only a duplicate scene summary', () => {
    const duplicateSummary = `Scene 6: The Freedom (10s)

Shot 1 [establishing] (6s) Camera: smooth dolly push-in from wide to medium Prompt: Morning sunlight streams through the large windows of the airy editing suite as the camera performs a smooth controlled dolly push-in revealing Minnie at the editing console.

Shot 2 [close-up] (4s) Camera: static close-up with subtle drift right Prompt: Minnies face fills the frame as she glances at the framed photograph of her team before a subtle genuine smile slowly curves her lips.`;

    expect(isDuplicateSceneSummary(duplicateSummary, sceneFixture)).toBe(true);
    expect(
      isDuplicateSceneSummary(
        'Use Scene 6 as the emotional release beat and keep the ending warm.',
        sceneFixture,
      ),
    ).toBe(false);
  });
});
