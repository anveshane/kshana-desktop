/**
 * Mock Prop Data
 * Props for the "Desert Survival Story" project
 */

import { generateSlug } from '../../../utils/slug';

/**
 * Prop data structure matching the existing PropAsset interface
 */
export interface PropData {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: 'clothing' | 'accessory' | 'item' | 'vehicle' | 'other';
  visual_description?: string;
  image_path?: string;
}

/**
 * Leather Backpack
 */
export const LEATHER_BACKPACK: PropData = {
  id: 'prop_001',
  name: 'Leather Backpack',
  slug: generateSlug('Leather Backpack'),
  description: 'Worn brown leather backpack with multiple pockets',
  category: 'accessory',
  visual_description: `- **Material:** Aged brown leather, showing signs of wear
- **Size:** Medium-sized, designed for extended field work
- **Features:** Multiple external pockets, adjustable shoulder straps, leather reinforcements at stress points
- **Condition:** Well-worn but functional, with visible scuff marks and patina
- **Details:** Brass buckles and zippers, leather name tag holder on front pocket`,
  image_path: 'props/leather-backpack/image.png',
};

/**
 * Straw Hat
 */
export const STRAW_HAT: PropData = {
  id: 'prop_002',
  name: 'Straw Hat',
  slug: generateSlug('Straw Hat'),
  description: 'Wide-brimmed straw hat for sun protection',
  category: 'clothing',
  visual_description: `- **Material:** Natural woven straw
- **Style:** Wide-brimmed, safari-style
- **Features:** Ventilation holes in crown, adjustable chin strap
- **Condition:** Slightly weathered from sun exposure
- **Details:** Dark brown leather band around the crown, frayed edges from wear`,
  image_path: 'props/straw-hat/image.png',
};

/**
 * Compass
 */
export const COMPASS: PropData = {
  id: 'prop_003',
  name: 'Compass',
  slug: generateSlug('Compass'),
  description: 'Vintage brass compass with leather strap',
  category: 'item',
  visual_description: `- **Material:** Polished brass casing, glass lens
- **Size:** Pocket-sized, fits comfortably in palm
- **Features:** Rotating bezel, luminous markings for night use, liquid-filled for stability
- **Condition:** Antique appearance, brass shows patina but functions perfectly
- **Details:** Leather carrying strap, small chain attachment, engraved initials on the back`,
  image_path: 'props/compass/image.png',
};

/**
 * Lantern
 */
export const LANTERN: PropData = {
  id: 'prop_004',
  name: 'Lantern',
  slug: generateSlug('Lantern'),
  description: 'Oil lantern with brass frame',
  category: 'item',
  visual_description: `- **Material:** Brass frame with glass panels
- **Size:** Medium, approximately 8 inches tall
- **Features:** Adjustable flame control, carrying handle, wind-resistant design
- **Condition:** Vintage, shows age but well-maintained
- **Details:** Ornate brass filigree work, smoky glass panes, oil reservoir visible through glass bottom`,
  image_path: 'props/lantern/image.png',
};

/**
 * All mock props
 */
export const MOCK_PROPS: PropData[] = [
  LEATHER_BACKPACK,
  STRAW_HAT,
  COMPASS,
  LANTERN,
];

/**
 * Generates markdown content for a prop's prop.md file
 */
export function generatePropMarkdown(prop: PropData): string {
  return `# ${prop.name}

## Description

${prop.description}

## Category

${prop.category}

## Visual Description

${prop.visual_description || prop.description}

## Usage Context

This prop is used throughout the Desert Survival Story project in various scenes featuring expedition equipment and character possessions.

## Notes

- Prop ID: ${prop.id}
- Slug: ${prop.slug}
- Image: ${prop.image_path || 'Not yet generated'}

`;
}

/**
 * Generates markdown content for all props
 */
export function generateAllPropMarkdowns(): Record<string, string> {
  const markdowns: Record<string, string> = {};
  for (const prop of MOCK_PROPS) {
    markdowns[prop.slug] = generatePropMarkdown(prop);
  }
  return markdowns;
}

/**
 * Gets a prop by slug
 */
export function getPropBySlug(slug: string): PropData | undefined {
  return MOCK_PROPS.find((prop) => prop.slug === slug);
}

/**
 * Gets a prop by ID
 */
export function getPropById(id: string): PropData | undefined {
  return MOCK_PROPS.find((prop) => prop.id === id);
}

