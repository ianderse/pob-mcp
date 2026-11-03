import { describe, it, expect } from '@jest/globals';
describe('probe', () => {
  it('loads luaClientManager under jest CJS', async () => {
    const mod = await import('../../src/server/luaClientManager.js');
    expect(typeof mod.LuaClientManager).toBe('function');
  });
});
