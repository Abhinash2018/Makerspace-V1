import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { checkPorts } from './launch.ts';

it('reports an occupied port without terminating its owner and allows reuse after release', async () => {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try { await expect(checkPorts([port])).rejects.toThrow(`Port ${port} is occupied`); expect(server.listening).toBe(true); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  await expect(checkPorts([port])).resolves.toBeUndefined();
});
