import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Thrilled v4 构建配置
 * - `pnpm dev`：Vite 开发服务器（浏览器直接预览，不在扩展里跑）
 * - `pnpm build`：scripts/build.mjs 调用本配置产出 dist/，再由 esbuild 补 background.js
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // 由 scripts/build.mjs 负责清空 dist（background 由 esbuild 后写，这里不能再清一次）
    emptyOutDir: false,
    target: 'es2022',
    assetsDir: 'assets',
    rollupOptions: { input: { index: 'index.html' } },
  },
})