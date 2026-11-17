import { defineConfig } from 'vite';
import { realpathSync } from 'node:fs';
import { loadConfiguration, workspaceRoot } from '../../packages/config/index.mjs';

export default defineConfig(({ command }) => {
  const config = command === 'serve' ? loadConfiguration() : undefined;
  return {
    server: {
      host: '127.0.0.1', port: 5173, strictPort: true, cors: false,
      fs: { allow: [realpathSync.native(workspaceRoot)], deny: ['.env', '.env.*', '**/*.{crt,pem}', '**/.git/**', '**/.runtime/**'] },
      proxy: config ? { '/api': { target: `http://127.0.0.1:${config.ports.gateway}`, changeOrigin: true } } : {},
    },
    plugins: [{
      name: 'loopback-browser-boundary',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.headers.host !== '127.0.0.1:5173' || (req.headers.origin !== undefined && req.headers.origin !== 'http://127.0.0.1:5173')) {
            res.statusCode = 403; res.end('Forbidden'); return;
          }
          res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
          next();
        });
      },
    }],
  };
});
