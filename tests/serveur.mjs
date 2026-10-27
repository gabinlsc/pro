// Serveur statique de test : sert public/ avec la CSP de production (deploy/pro-security.conf).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

export const racine = resolve(new URL('..', import.meta.url).pathname), pub = join(racine, 'public');
export const csp = readFileSync(join(racine, 'deploy/pro-security.conf'), 'utf8').match(/Content-Security-Policy "([^"]+)"/)[1];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain' };
export async function servir() {
  const srv = createServer((q, r) => {
    let p = join(pub, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) { r.statusCode = 404; r.end('404'); return; }
    r.setHeader('content-type', types[extname(p)] ?? 'application/octet-stream'); r.setHeader('content-security-policy', csp); r.end(readFileSync(p));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
export const ok = (m) => console.log('✓ ' + m);
