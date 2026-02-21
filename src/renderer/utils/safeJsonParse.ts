/**
 * Safe JSON parser that recovers from common corruption patterns
 * (e.g. two JSON objects concatenated after an interrupted/overlapping write).
 */
export function safeJsonParse<T>(content: string): T {
  // Fast path: try standard parse first
  try {
    return JSON.parse(content) as T;
  } catch {
    // Fall through to recovery
  }

  // Strip BOM and trim whitespace
  const trimmed = content.replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new SyntaxError('Empty JSON content');

  // Try trimmed content
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Fall through to brace-matching recovery
  }

  // Extract the first balanced JSON object/array by tracking depth
  const startChar = trimmed[0];
  if (startChar !== '{' && startChar !== '[') {
    throw new SyntaxError(`Unexpected token ${startChar} at start of JSON`);
  }

  const endChar = startChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === startChar) depth++;
    if (ch === endChar) {
      depth--;
      if (depth === 0) {
        return JSON.parse(trimmed.substring(0, i + 1)) as T;
      }
    }
  }

  throw new SyntaxError('Could not recover valid JSON from corrupted content');
}
