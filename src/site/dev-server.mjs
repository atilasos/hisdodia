import { createServer as createHttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;
const DEFAULT_ROOT = 'dist';

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.vtt', 'text/vtt; charset=utf-8'],
  ['.webp', 'image/webp']
]);

export function contentTypeFor(filePath) {
  return CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

export function resolveRequestPath(rootDir, requestUrl) {
  const root = path.resolve(rootDir);
  const rawPath = String(requestUrl).split(/[?#]/, 1)[0];
  let decodedRawPath;

  try {
    decodedRawPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  if (decodedRawPath.split(/[\\/]+/).includes('..')) {
    return null;
  }

  const url = new URL(requestUrl, 'http://localhost');
  const decodedPath = decodeURIComponent(url.pathname);

  if (decodedPath.split(/[\\/]+/).includes('..')) {
    return null;
  }

  const normalizedPath = path.normalize(decodedPath).replace(/^[/\\]+/, '');
  const candidate = path.resolve(root, normalizedPath);

  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return candidate;
}

async function fileForRequest(rootDir, requestUrl) {
  const resolved = resolveRequestPath(rootDir, requestUrl);

  if (!resolved) {
    return null;
  }

  try {
    const info = await stat(resolved);
    return info.isDirectory() ? path.join(resolved, 'index.html') : resolved;
  } catch {
    if (!path.extname(resolved)) {
      return path.join(resolved, 'index.html');
    }
    return resolved;
  }
}

export function createStaticServer({ rootDir = DEFAULT_ROOT } = {}) {
  return createHttpServer(async (request, response) => {
    if (!request.url || !['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method Not Allowed');
      return;
    }

    const filePath = await fileForRequest(rootDir, request.url);

    if (!filePath) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const host = process.env.HOST || DEFAULT_HOST;
  const rootDir = process.env.SITE_ROOT || DEFAULT_ROOT;
  const server = createStaticServer({ rootDir });

  server.listen(port, host, () => {
    console.log(`Serving ${path.resolve(rootDir)} at http://${host}:${port}/`);
  });
}
