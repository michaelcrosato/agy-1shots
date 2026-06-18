import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Normalize path for Windows compatibility (glob patterns require forward slashes)
const rapierWasmSource = path
  .resolve(__dirname, 'node_modules/@dimforge/rapier3d-compat/rapier_wasm3d_bg.wasm')
  .replace(/\\/g, '/');

export default defineConfig({
  plugins: [
    // 1. Copy the Rapier WASM binary to dist/ output (and serve it at root in dev)
    viteStaticCopy({
      targets: [
        {
          src: rapierWasmSource,
          dest: '.', // Destination is relative to build outDir (dist/)
        },
      ],
    }),
    // 2. Custom dev-server middleware to fix Windows registry MIME type issue for WASM
    {
      name: 'wasm-mime-override',
      configureServer(server) {
        server.middlewares.use((/** @type {any} */ req, res, next) => {
          if (req.url && req.url.split('?')[0].endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
          next();
        });
      },
    },
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Manual chunking to ensure clear separation of core, physics and rendering dependencies
        manualChunks(id) {
          if (id.includes('@dimforge/rapier3d-compat')) {
            return 'rapier-physics';
          }
          if (id.includes('three')) {
            return 'three-rendering';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: ['..'], // Allow access to monorepo parent folders if needed
    },
  },
});
