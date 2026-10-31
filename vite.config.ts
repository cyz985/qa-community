import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置：React 插件 + 开发端口
// 构建时 base 指向 GitHub Pages 的子路径，开发时保持根路径
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/qa-community/' : '/',
  server: {
    port: 5173,
  },
}));
