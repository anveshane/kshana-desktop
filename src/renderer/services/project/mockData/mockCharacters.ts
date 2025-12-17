/**
 * Mock Character Data
 * Characters for the "Desert Survival Story" project
 */

import type { CharacterData } from '../../../types/kshana';
import {
  getTestImageForCharacter,
  resolveTestAssetPath,
} from './testAssetMapping';

/**
 * Alice Chen - Main protagonist
 */
export const ALICE_CHEN: CharacterData = {
  name: 'Alice Chen',
  slug: 'alice-chen',
  description: `A determined 28-year-old archaeologist who has dedicated her life to uncovering the mysteries of ancient civilizations. Growing up in San Francisco with immigrant parents who ran an antique shop, she developed a fascination with historical artifacts from a young age. After completing her PhD at Stanford, she joined an expedition team specializing in North African excavations.`,
  visual_description: `- **Hair:** Long black hair, usually tied back in a practical ponytail
- **Eyes:** Deep brown, often squinting against the desert sun
- **Build:** Athletic and lean from years of fieldwork
- **Clothing:** Khaki field jacket, worn hiking boots, practical cargo pants
- **Distinguishing Features:** Small scar above left eyebrow from a childhood accident, always wears her grandmother's jade pendant`,
  approval_status: 'approved',
  reference_image_approval_status: 'approved',
  content_artifact_id: 'char_alice_content_001',
  reference_image_id: 'char_alice_ref_001',
  reference_image_path: (() => {
    const testImage = getTestImageForCharacter('alice-chen');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/characters/alice-chen/reference.png';
  })(),
  approved_at: Date.now() - 86400000 * 2, // 2 days ago
  reference_image_approved_at: Date.now() - 86400000, // 1 day ago
  regeneration_count: 1,
};

/**
 * Marcus Webb - Supporting character
 */
export const MARCUS_WEBB: CharacterData = {
  name: 'Marcus Webb',
  slug: 'marcus-webb',
  description: `A seasoned 45-year-old expedition guide and former military veteran. Marcus has spent two decades navigating the harshest terrains on Earth. His calm demeanor and survival expertise have saved countless lives, though he carries the weight of those he couldn't save. He views Alice as the daughter he never had and is fiercely protective of the team.`,
  visual_description: `- **Hair:** Short-cropped gray hair, balding at the crown
- **Eyes:** Weathered blue-gray, crow's feet from years in the sun
- **Build:** Broad-shouldered, muscular despite his age
- **Clothing:** Desert camouflage shirt, utility vest with multiple pockets, worn leather boots
- **Distinguishing Features:** Prominent scar on right forearm, salt-and-pepper stubble, always carries a worn compass`,
  approval_status: 'approved',
  reference_image_approval_status: 'in_review',
  content_artifact_id: 'char_marcus_content_001',
  reference_image_id: 'char_marcus_ref_001',
  reference_image_path: (() => {
    const testImage = getTestImageForCharacter('marcus-webb');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/characters/marcus-webb/reference.png';
  })(),
  approved_at: Date.now() - 86400000 * 2,
  regeneration_count: 0,
};

/**
 * Dr. Fatima Hassan - Supporting character
 */
export const FATIMA_HASSAN: CharacterData = {
  name: 'Dr. Fatima Hassan',
  slug: 'fatima-hassan',
  description: `A brilliant 35-year-old Egyptologist and linguist who grew up in Cairo. Fatima is an expert in ancient North African languages and has translated dozens of previously undecipherable texts. Her sharp intellect is matched only by her dry wit. She joined Alice's team after they discovered her groundbreaking paper on Berber hieroglyphics.`,
  visual_description: `- **Hair:** Dark curly hair, usually covered with a traditional headscarf in earth tones
- **Eyes:** Warm brown with gold flecks, often behind round glasses
- **Build:** Petite but carries herself with confidence
- **Clothing:** Loose linen blouse, comfortable wide-leg pants, sensible sandals
- **Distinguishing Features:** Small tattoo of an ankh on her wrist, reads with a magnifying glass she keeps on a chain`,
  approval_status: 'approved',
  reference_image_approval_status: 'pending',
  content_artifact_id: 'char_fatima_content_001',
  approved_at: Date.now() - 86400000 * 3,
  regeneration_count: 2,
};

/**
 * All mock characters
 */
export const MOCK_CHARACTERS: CharacterData[] = [
  ALICE_CHEN,
  MARCUS_WEBB,
  FATIMA_HASSAN,
];

/**
 * Creates a copy of mock characters with fresh timestamps
 */
export function createMockCharacters(): CharacterData[] {
  const now = Date.now();
  return MOCK_CHARACTERS.map((char, index) => ({
    ...char,
    approved_at: char.approved_at ? now - 86400000 * (index + 1) : undefined,
    reference_image_approved_at: char.reference_image_approved_at
      ? now - 86400000 * index
      : undefined,
  }));
}

