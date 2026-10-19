/**
 * Thrilled 发布脚本
 *
 * 流程：
 *   1. 读取 package.json/manifest.json 中的项目名与版本号
 *   2. 将 dist/ 打包为 dist.zip
 *   3. 复制到本地 releases/ 目录，命名为 <项目名>-<版本>.zip（如 thrilled-3.0.zip）
 *   4. 创建 git tag v<version> 并推送
 *   5. 通过 gh CLI 创建 GitHub Release 并上传 releases/<项目名>-<版本>.zip 作为产物
 *
 * 说明：dist/ 不提交到 git 仓库，仅其压缩包作为 Release 产物上传。
 *       releases/ 为本地产物目录，不提交 git。
 *       Release 说明只取 BUG_FIXES.md 当前版本分组的几条，简短即可（不贴整份记录）。
 *       BUG_FIXES.md 为本地文档（已 gitignore），上传前需存在当前版本分组。
 *
 * 用法：node scripts/release.mjs
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const DIST_ZIP = join(ROOT, 'dist.zip');
const RELEASES_DIR = join(ROOT, 'releases');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'inherit', ...opts });
}

function runCapture(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function main() {
  if (!existsSync(DIST)) {
    console.error('[release] dist/ 不存在，请先运行 node scripts/build.mjs --prod');
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const projectName = pkg.name || 'thrilled';
  const version = manifest.version;
  const tag = `v${version}`;
  const releaseZipName = `${projectName}-${version}.zip`;
  const releaseZipPath = join(RELEASES_DIR, releaseZipName);
  console.log(`[release] 项目：${projectName}  版本：${version}（tag: ${tag}）`);

  // 1. 打包 dist → dist.zip（先清理旧包）
  if (existsSync(DIST_ZIP)) rmSync(DIST_ZIP, { force: true });
  if (process.platform === 'win32') {
    run('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Force -Path '${DIST}\\*' -DestinationPath '${DIST_ZIP}'`]);
  } else {
    run('zip', ['-r', '-q', DIST_ZIP, '.'], { cwd: DIST });
  }
  console.log('[release] 已打包 dist.zip');

  // 2. 复制到本地 releases/ 目录，命名为 <项目名>-<版本>.zip
  mkdirSync(RELEASES_DIR, { recursive: true });
  if (existsSync(releaseZipPath)) rmSync(releaseZipPath, { force: true });
  cpSync(DIST_ZIP, releaseZipPath);
  console.log(`[release] 已保存到本地 ${releaseZipPath}`);

  // 3. 创建并推送 tag（dist 不提交 git，tag 仅作为发布锚点）
  const hasGh = runCapture('gh', ['--version']).length > 0;
  if (!hasGh) {
    console.warn('[release] 未检测到 gh CLI，跳过创建 Release。本地包已生成在 releases/。');
    console.warn(`[release] 请手动执行：git tag ${tag} && git push origin ${tag}，并在 GitHub 上传 ${releaseZipName}`);
    return;
  }

  run('git', ['tag', '-f', tag]);
  run('git', ['push', 'origin', '-f', tag]);
  console.log(`[release] 已推送 tag ${tag}`);

  // 4. 创建 GitHub Release 并上传本地包作为产物（已存在则更新产物与说明）
  const tmpNotes = join(ROOT, `.release-notes-${version}.md`);
  mkdirSync(dirname(tmpNotes), { recursive: true });
  writeFileSync(tmpNotes, releaseNotesOf(version), 'utf8');

  const releaseAlreadyExists = runCapture('gh', ['release', 'view', tag]).length > 0;
  if (releaseAlreadyExists) {
    run('gh', ['release', 'upload', tag, releaseZipPath, '--clobber']);
    run('gh', ['release', 'edit', tag, '--notes-file', tmpNotes]);
    console.log(`[release] GitHub Release ${tag} 已存在，已更新产物与说明 ${releaseZipName}`);
  } else {
    run('gh', ['release', 'create', tag, releaseZipPath,
      '--title', `${pkg.productName || 'Thrilled'} ${version}`,
      '--notes-file', tmpNotes,
      '--latest']);
    console.log(`[release] 已创建 Release ${tag} 并上传 ${releaseZipName}`);
  }
  rmSync(tmpNotes, { force: true });
}

/**
 * Release 说明：只取 BUG_FIXES.md 中当前版本那一组条目（简短几句），
 * 不把整份修复记录贴上去；找不到对应分组时退回一行说明。
 */
function releaseNotesOf(version) {
  const notesFile = join(ROOT, 'BUG_FIXES.md');
  const fallback = `Thrilled ${version}\n\n- 下载 zip 解压后，在浏览器扩展页「加载解压缩的扩展」选择该目录。`;
  if (!existsSync(notesFile)) return fallback;
  const lines = readFileSync(notesFile, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## v${version}`));
  if (start < 0) return fallback;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const section = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return [
    `Thrilled ${version}`,
    '',
    section,
    '',
    '安装 / 更新：解压后覆盖原目录，在扩展管理页点「重新加载」。详见 INSTALL.md。',
  ].join('\n');
}

main();
