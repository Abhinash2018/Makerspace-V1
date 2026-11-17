import { createServer } from 'vite';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { workspaceRoot } from '../packages/config/index.mjs';

// Vite deliberately rejects Windows 8.3 aliases in served paths. Resolve the
// real kiosk directory before Vite derives request filenames from this root.
const server = await createServer({ root: realpathSync.native(path.join(workspaceRoot, 'apps/kiosk')) });
const stop = async () => { await server.close(); if (process.connected) process.disconnect(); };
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
process.on('message', message => { if (message === 'shutdown') void stop(); });
try { await server.listen(); }
catch { console.error('Kiosk development server failed to start.'); await stop(); process.exitCode = 1; }
