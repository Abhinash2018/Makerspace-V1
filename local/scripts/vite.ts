import { createServer } from 'vite';
import path from 'node:path';
import { workspaceRoot } from '../packages/config/index.mjs';

const server = await createServer({ root: path.join(workspaceRoot, 'apps/kiosk') });
const stop = async () => { await server.close(); if (process.connected) process.disconnect(); };
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
process.on('message', message => { if (message === 'shutdown') void stop(); });
try { await server.listen(); }
catch { console.error('Kiosk development server failed to start.'); await stop(); process.exitCode = 1; }
