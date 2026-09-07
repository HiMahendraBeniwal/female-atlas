import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
const path=(relative:string)=>fileURLToPath(new URL(relative,import.meta.url));
export default defineConfig({
  root: path('./web'),
  publicDir: path('./public'),
  plugins: [react()],
  resolve: { alias: { '@': path('./') } },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    watch: { usePolling: true },
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  build: { outDir: path('./dist'), emptyOutDir: true }
});
