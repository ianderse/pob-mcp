import { describe, it, expect } from '@jest/globals';
import { handleGemUpgradePath } from '../../src/handlers/skillGemHandlers.js';

describe('handleGemUpgradePath', () => {
  it('skips gems the bridge reports without a name instead of crashing', async () => {
    const luaClient = {
      getSkills: async () => ({
        mainSocketGroup: 1,
        groups: [
          {
            index: 1,
            label: 'Main',
            gems: [
              { name: '', level: 1, quality: 0 },
              { name: 'Cyclone', level: 18, quality: 0 },
              'Fortify Support',
            ],
          },
        ],
      }),
    };
    const context: any = {
      ensureLuaClient: async () => {},
      getLuaClient: () => luaClient,
    };

    const result = await handleGemUpgradePath(context, {});
    const text = result.content[0].text;

    expect(text).toContain('Cyclone');
    expect(text).toContain('Fortify Support');
  });
});
