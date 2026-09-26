import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import './build.mjs';

const root = await realpath('dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!(path === '/' || path === '/index.html' || path.startsWith('/src/') || path.startsWith('/styles/'))) throw new Error('Not found');
    const file = await realpath(resolve(root, path === '/' ? 'index.html' : path.slice(1)));
    if (!file.startsWith(root + sep) || !mime[extname(file)]) throw new Error('Not found');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(5173, '127.0.0.1', () => console.log('Libro de cuotas: http://localhost:5173'));
