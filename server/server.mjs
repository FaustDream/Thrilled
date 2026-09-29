/**
 * Thrilled 云端存储参考服务端（零依赖 Node 单文件）
 *
 * 端点：
 *   GET  /thrilled/doc   → 200 {"doc": {...}}；无数据 404
 *   PUT  /thrilled/doc   → 保存整份文档 JSON（覆盖式，最后写入者胜）
 *   GET  /health         → 200 "ok"
 *
 * 鉴权：请求头 Authorization: Bearer <TOKEN>；TOKEN 未设置时不鉴权（仅限本机/内网使用）。
 * 数据落盘：DATA_DIR/doc.json（默认 ./data/doc.json，自动创建）。
 *
 * 运行：TOKEN=你的令牌 PORT=8787 node server/server.mjs
 * 安全：本文件与仓库不包含任何真实地址 / 令牌 / 数据；data/ 已加入 .gitignore。
 */

import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.TOKEN ?? '';
const DATA_DIR = process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'data');
const DOC_FILE = join(DATA_DIR, 'doc.json');

const DOC_PATH = '/thrilled/doc';

/** CORS：允许任意来源携带 Authorization 头访问（自部署场景；公网部署建议收紧为固定来源） */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const authorized = (req) => {
  if (TOKEN === '') return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
};

const readDoc = () => (existsSync(DOC_FILE) ? readFileSync(DOC_FILE, 'utf8') : null);

const writeDoc = (body) => {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DOC_FILE}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, DOC_FILE);
};

const server = createServer((req, res) => {
  const url = (req.url ?? '').split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders).end();
    return;
  }
  if (url === '/health') {
    res.writeHead(200, corsHeaders).end('ok');
    return;
  }
  if (url !== DOC_PATH) {
    res.writeHead(404, corsHeaders).end('not found');
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json', ...corsHeaders }).end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  if (req.method === 'GET') {
    const body = readDoc();
    if (body === null) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'empty' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders }).end(body);
    return;
  }
  if (req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) req.destroy(); // 上限 8MB
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed !== 'object' || parsed === null || typeof parsed.v !== 'number') {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders }).end(JSON.stringify({ error: 'invalid doc' }));
          return;
        }
        writeDoc(JSON.stringify(parsed));
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders }).end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders }).end(JSON.stringify({ error: 'bad json' }));
      }
    });
    return;
  }
  res.writeHead(405, corsHeaders).end('method not allowed');
});

server.listen(PORT, () => {
  console.log(`Thrilled cloud storage server listening on :${PORT}`);
  console.log(`Auth: ${TOKEN === '' ? 'DISABLED (set TOKEN env to enable)' : 'Bearer token enabled'}`);
  console.log(`Data: ${DOC_FILE}`);
});
