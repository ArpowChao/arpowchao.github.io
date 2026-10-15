import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let target = resolve(root, `.${pathname}`);
    if (relative(root, target).startsWith('..')) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
    const data = await readFile(target);
    response.setHeader('Content-Type', `${mime[extname(target)] || 'application/octet-stream'}; charset=utf-8`);
    response.end(data);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${port}/apps/semiconductor-process/`);
});
