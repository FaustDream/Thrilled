/**
 * Thrilled v4 构建脚本
 * 1) Vite 构建 React 应用（index.html + src/app → dist/）
 * 2) esbuild 打 background service worker（IIFE 单文件，MV3 要求）
 * 3) 拷贝 manifest.json 与 icons/ 到 dist/（manifest 内的路径都是 dist 内相对路径）
 *
 * 说明：加载扩展时选 dist/ 目录；dist/ 是构建产物，不提交到 git。
 */
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
/** 默认生产构建（交付扩展用）；`--dev` 才是 development（本地排查用，React 带 dev 警告且体积大） */
const PROD = !process.argv.includes('--dev');

const buildApp = async () => {
  const { build: viteBuild } = await import('vite');
  await viteBuild({
    configFile: join(ROOT, 'vite.config.ts'),
    mode: PROD ? 'production' : 'development',
    emptyOutDir: true,
    logLevel: 'info',
  });
};

const buildBackground = async () => {
  await build({
    entryPoints: [join(ROOT, 'src/background/index.ts')],
    outfile: join(DIST, 'background.js'),
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: PROD,
    sourcemap: true,
    logLevel: 'info',
  });
};

const copyStatics = () => {
  cpSync(join(ROOT, 'manifest.json'), join(DIST, 'manifest.json'));
  cpSync(join(ROOT, 'icons'), join(DIST, 'icons'), { recursive: true });
};

/**
 * 清理上一轮遗留的 hash 产物
 *
 * dist 被加载中的扩展占用时整体删除会失败，vite 的 emptyOutDir 同样清不干净，
 * 结果旧 index-*.js 一直躺在 assets 里被一起打进发布包（实测 5.0 的 zip 一度有 5 份旧包）。
 * 这里以 index.html 的实际引用为准，把没被引用的资源删掉。
 */
const pruneStaleAssets = () => {
  const assetsDir = join(DIST, 'assets');
  if (!existsSync(assetsDir)) return;
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const keep = new Set([...html.matchAll(/(?:src|href)="\.?\/?assets\/([^"]+)"/g)].map((m) => m[1]));
  let removed = 0;
  for (const name of readdirSync(assetsDir)) {
    if (keep.has(name)) continue;
    try {
      rmSync(join(assetsDir, name), { force: true });
      removed += 1;
    } catch (e) {
      console.warn(`[build] 旧产物删不掉（文件被占用）: ${name}`, e instanceof Error ? e.message : String(e));
    }
  }
  if (removed > 0) console.log(`[build] 已清理 ${removed} 个旧产物`);
};

async function main() {
  /* dist 可能被加载中的 Chrome 持有句柄（扩展目录）而无法整体删除：
     删不掉就跳过，靠 vite 的 emptyOutDir 与覆盖写完成原地重建 */
  try {
    rmSync(DIST, { recursive: true, force: true });
  } catch (e) {
    console.warn('[build] dist 目录被占用，跳过整体清理（原地覆盖重建）:', e instanceof Error ? e.message : String(e));
  }
  mkdirSync(DIST, { recursive: true });
  await buildApp();
  await buildBackground();
  copyStatics();
  pruneStaleAssets();
  console.log(`[build] 完成 → dist/（${PROD ? 'production' : 'development'}）`);
}

main().catch((err) => {
  console.error('[build] 失败:', err);
  process.exit(1);
});