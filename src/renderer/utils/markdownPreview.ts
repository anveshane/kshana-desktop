/**
 * Extracts key-value pairs from markdown formatted as **Key:** value or - **Key:** value
 * Returns an array of {key, value} objects
 */
export function extractKeyValuePairs(markdown: string, maxPairs: number = 3): Array<{key: string; value: string}> {
  if (!markdown || typeof markdown !== 'string') {
    return [];
  }

  const pairs: Array<{key: string; value: string}> = [];
  
  // Find all **Key:** patterns (with optional leading - or * for list items)
  // This handles both formats: "**Key:** value" and "- **Key:** value"
  const keyPattern = /(?:^|\n)[\s]*[-*]?\s*\*\*([^*:]+?):\*\*\s*(.*?)(?=\n[\s]*[-*]?\s*\*\*[^*:]+?:\*\*|$)/gm;
  let match;
  let count = 0;
  
  // Extract key-value pairs
  while ((match = keyPattern.exec(markdown)) !== null && count < maxPairs) {
    const key = match[1].trim();
    let value = match[2].trim();
    
    // Clean up value - remove trailing dashes and extra whitespace
    value = value.replace(/\s*-\s*$/, '').trim();
    value = value.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
    
    // Skip empty values
    if (!value) continue;
    
    // Limit value length for display
    if (value.length > 80) {
      value = value.substring(0, 77) + '...';
    }
    
    pairs.push({ key, value });
    count++;
  }
  
  // Fallback: if no matches found with list format, try without list markers
  if (pairs.length === 0) {
    const simplePattern = /\*\*([^*:]+?):\*\*\s*([^\n*]+)/g;
    let simpleMatch;
    let simpleCount = 0;
    
    while ((simpleMatch = simplePattern.exec(markdown)) !== null && simpleCount < maxPairs) {
      const key = simpleMatch[1].trim();
      let value = simpleMatch[2].trim();
      
      // Stop at the next **Key:** pattern if found within the value
      const nextKeyMatch = value.match(/\*\*([^*:]+?):\*\*/);
      if (nextKeyMatch) {
        value = value.substring(0, value.indexOf(nextKeyMatch[0])).trim();
      }
      
      // Clean up value
      value = value.replace(/\s*-\s*$/, '').trim();
      value = value.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
      
      if (!value) continue;
      
      if (value.length > 80) {
        value = value.substring(0, 77) + '...';
      }
      
      pairs.push({ key, value });
      simpleCount++;
    }
  }
  
  return pairs;
}
