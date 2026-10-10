/**
 * Thrilled v4 构建脚本
 * 1) Vite 构建 React 应用（index.html + src/app → dist/）
 * 2) esbuild 打 background service worker（IIFE 单文件，MV3 要求）
 * 3) 拷贝 manifest.json 与 icons/ 到 dist/（manifest 内的路径都是 dist 内相对路径）
 *
 * 说明：加载扩展时选 dist/ 目录；dist/ 是构建产物，不提交到 git。
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
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
  console.log(`[build] 完成 → dist/（${PROD ? 'production' : 'development'}）`);
}

main().catch((err) => {
  console.error('[build] 失败:', err);
  process.exit(1);
});