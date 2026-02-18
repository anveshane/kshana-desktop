/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
import { app } from 'electron';

export function resolveHtmlPath(htmlFileName: string) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }

  // In production, files are packaged in ASAR
  // When packaged: __dirname = app.asar/dist/main
  // Renderer files are at: app.asar/dist/renderer/index.html
  // Electron handles ASAR paths automatically with file:// protocol
  const htmlPath = path.join(__dirname, '../renderer/', htmlFileName);
  // Normalize the path and ensure it works with ASAR
  const normalizedPath = path.normalize(htmlPath).replace(/\\/g, '/');
  return `file://${normalizedPath}`;
}
