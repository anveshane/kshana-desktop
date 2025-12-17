/**
 * Mock Setting Data
 * Locations for the "Desert Survival Story" project
 */

import type { SettingData } from '../../../types/kshana';
import {
  getTestImageForSetting,
  resolveTestAssetPath,
} from './testAssetMapping';

/**
 * Dusty Village - Main location
 */
export const DUSTY_VILLAGE: SettingData = {
  name: 'Dusty Village',
  slug: 'dusty-village',
  description: `An abandoned desert outpost that once served as a trading post along ancient caravan routes. The village has been empty for decades, its mud-brick buildings slowly succumbing to the relentless desert winds. Local legends speak of a curse that drove the inhabitants away, though historians attribute it to the drying up of the underground spring that once sustained life here.`,
  visual_description: `- **Architecture:** Traditional adobe mud-brick buildings, partially collapsed roofs
- **Atmosphere:** Dry, windswept, eerily quiet with occasional sand devils
- **Time of Day:** Late afternoon, golden hour light casting long shadows
- **Key Elements:** Ancient stone well at the center (now dry), overturned wooden cart, tumbleweeds caught against crumbling walls, faded painted symbols on doorframes
- **Color Palette:** Ochre, terracotta, dusty beige, deep shadows`,
  approval_status: 'approved',
  reference_image_approval_status: 'approved',
  content_artifact_id: 'set_dusty_village_content_001',
  reference_image_id: 'set_dusty_village_ref_001',
  reference_image_path: (() => {
    const testImage = getTestImageForSetting('dusty-village');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/settings/dusty-village/reference.png';
  })(),
  approved_at: Date.now() - 86400000 * 3,
  reference_image_approved_at: Date.now() - 86400000 * 2,
  regeneration_count: 0,
};

/**
 * Desert Camp - Base camp location
 */
export const DESERT_CAMP: SettingData = {
  name: 'Desert Camp',
  slug: 'desert-camp',
  description: `The expedition's temporary base camp set up at the edge of a rocky plateau overlooking vast sand dunes. The camp consists of several weatherproof tents, a makeshift laboratory, and a communications station. Solar panels provide power, and the team has established a perimeter of LED markers for night navigation.`,
  visual_description: `- **Architecture:** Modern expedition tents in khaki and olive drab, equipment containers
- **Atmosphere:** Organized chaos, sense of purpose and scientific endeavor
- **Time of Day:** Various - dawn light for early scenes, harsh midday sun, starlit nights
- **Key Elements:** Central work tent with maps and artifacts, satellite dish, 4x4 vehicles, water storage tanks, camp fire circle
- **Color Palette:** Military greens, canvas browns, metallic equipment, orange tent accents`,
  approval_status: 'approved',
  reference_image_approval_status: 'approved',
  content_artifact_id: 'set_desert_camp_content_001',
  reference_image_id: 'set_desert_camp_ref_001',
  reference_image_path: (() => {
    const testImage = getTestImageForSetting('desert-camp');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/settings/desert-camp/reference.png';
  })(),
  approved_at: Date.now() - 86400000 * 3,
  reference_image_approved_at: Date.now() - 86400000 * 2,
  regeneration_count: 1,
};

/**
 * Underground Tomb - Discovery location
 */
export const UNDERGROUND_TOMB: SettingData = {
  name: 'Underground Tomb',
  slug: 'underground-tomb',
  description: `A recently discovered burial chamber hidden beneath the desert sands. The tomb dates back approximately 3,000 years and appears to belong to a previously unknown civilization. The walls are covered in mysterious hieroglyphics and the chamber contains several sarcophagi, pottery, and golden artifacts that have remained untouched for millennia.`,
  visual_description: `- **Architecture:** Carved stone walls with intricate relief carvings, pillared entrance
- **Atmosphere:** Dark and mysterious, dust particles visible in flashlight beams
- **Lighting:** Artificial lighting from expedition equipment, creating dramatic shadows
- **Key Elements:** Ornate sarcophagus at center, wall paintings depicting ancient rituals, clay pots and ceremonial items, narrow passageways
- **Color Palette:** Deep blacks, warm amber from flashlights, gold leaf glinting, aged stone gray`,
  approval_status: 'in_review',
  reference_image_approval_status: 'pending',
  content_artifact_id: 'set_underground_tomb_content_001',
  regeneration_count: 0,
};

/**
 * All mock settings
 */
export const MOCK_SETTINGS: SettingData[] = [
  DUSTY_VILLAGE,
  DESERT_CAMP,
  UNDERGROUND_TOMB,
];

/**
 * Creates a copy of mock settings with fresh timestamps
 */
export function createMockSettings(): SettingData[] {
  const now = Date.now();
  return MOCK_SETTINGS.map((setting, index) => ({
    ...setting,
    approved_at: setting.approved_at ? now - 86400000 * (index + 1) : undefined,
    reference_image_approved_at: setting.reference_image_approved_at
      ? now - 86400000 * index
      : undefined,
  }));
}

