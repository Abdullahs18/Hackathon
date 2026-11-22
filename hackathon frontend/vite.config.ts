import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { validateDeploymentEnv } from './deployment.config.ts';

// https://vite.dev/config/
export default defineConfig(({mode}) => {
  validateDeploymentEnv(loadEnv(mode, process.cwd(), ''));
  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  };
});
