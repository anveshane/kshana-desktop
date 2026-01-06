/**
 * Slug Utility
 * Generates URL-safe slugs from display names
 */

/**
 * Generates a URL-safe slug from a display name
 *
 * Examples:
 * - "Leather Backpack" → "leather-backpack"
 * - "Alice Chen" → "alice-chen"
 * - "Dr. Fatima Hassan" → "dr-fatima-hassan"
 * - "Straw Hat (Wide-brimmed)" → "straw-hat-wide-brimmed"
 *
 * @param name - The display name to convert to a slug
 * @returns URL-safe slug (lowercase, hyphenated, no special chars)
 */
export function generateSlug(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return (
    name
      .toLowerCase()
      // Replace multiple spaces with single space
      .replace(/\s+/g, ' ')
      // Trim whitespace
      .trim()
      // Replace spaces with hyphens
      .replace(/\s/g, '-')
      // Remove special characters except hyphens
      .replace(/[^a-z0-9-]/g, '')
      // Replace multiple consecutive hyphens with single hyphen
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Validates if a string is a valid slug
 *
 * @param slug - The string to validate
 * @returns true if valid slug format
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Slug should only contain lowercase letters, numbers, and hyphens
  // Should not start or end with hyphen
  // Should not contain consecutive hyphens
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
