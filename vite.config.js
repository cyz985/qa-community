import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Vite 配置：React 插件 + 开发端口
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
    },
});
