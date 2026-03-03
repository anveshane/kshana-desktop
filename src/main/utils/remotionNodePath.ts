import path from 'path';

export function normalizeNodePathEntry(
  entry: string,
  cwd: string = process.cwd(),
): string {
  const trimmed = entry.trim();
  if (!trimmed) {
    return trimmed;
  }

  const root = path.parse(cwd).root || path.sep;
  const absolute = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(root, trimmed);
  return absolute.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );
}

export function buildPackagedNodePath(
  rawNodePath: string | undefined,
  resourcesPath: string | undefined,
  cwd: string = process.cwd(),
): string {
  const normalizedEntries = rawNodePath
    ? rawNodePath
        .split(path.delimiter)
        .map((entry) => normalizeNodePathEntry(entry, cwd))
        .filter((value): value is string => Boolean(value))
    : [];
  const unpackedNodeModulesPath = resourcesPath
    ? normalizeNodePathEntry(
        path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'),
        cwd,
      )
    : '';
  if (
    unpackedNodeModulesPath &&
    !normalizedEntries.includes(unpackedNodeModulesPath)
  ) {
    normalizedEntries.push(unpackedNodeModulesPath);
  }
  return [...new Set(normalizedEntries)].join(path.delimiter);
}
