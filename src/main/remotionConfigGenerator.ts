/**
 * Generates Remotion render input from timeline infographic items and placement metadata.
 */
import path from 'path';
import fs from 'fs/promises';
import type {
  RemotionRenderInput,
  RemotionPlacement,
  RemotionTimelineItem,
  ParsedInfographicPlacement,
} from '../shared/remotionTypes';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Builds Remotion placements from timeline infographic items.
 * Matches each item to placement metadata by placementNumber.
 */
export function buildRemotionPlacements(
  timelineItems: RemotionTimelineItem[],
  infographicPlacements: ParsedInfographicPlacement[],
): RemotionPlacement[] {
  const placementMap = new Map(
    infographicPlacements.map((p) => [p.placementNumber, p]),
  );

  return timelineItems
    .filter((item) => item.placementNumber !== undefined)
    .map((item) => {
      const placement = placementMap.get(item.placementNumber!);
      const infographicType = placement?.infographicType ?? 'statistic';
      const prompt = item.prompt ?? placement?.prompt ?? '';
      const data = placement?.data;

      return {
        placementNumber: item.placementNumber!,
        startTime: formatTime(item.startTime),
        endTime: formatTime(item.endTime),
        infographicType,
        prompt,
        data,
        componentName: `Infographic${item.placementNumber}`,
      };
    });
}

/**
 * Writes render config to job temp directory.
 */
export async function writeRenderConfig(
  tempDir: string,
  placements: RemotionPlacement[],
): Promise<string> {
  const configPath = path.join(tempDir, 'input', 'render-config.json');
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  const config: RemotionRenderInput = { placements };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return configPath;
}
