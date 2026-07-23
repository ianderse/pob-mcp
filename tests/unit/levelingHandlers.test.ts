import { describe, it, expect } from '@jest/globals';
import { handlePlanLeveling, type LevelingContext } from '../../src/handlers/levelingHandlers.js';
import type { PoBBuild } from '../../src/types.js';

const textOf = (result: any) => result.content[0].text as string;

const gem = (nameSpec: string, support = false) => ({
  nameSpec,
  skillId: support ? `Support${nameSpec.replace(/\s/g, '')}` : nameSpec.replace(/\s/g, ''),
  gemId: `Metadata/Items/Gems/${support ? 'SupportGem' : 'SkillGem'}${nameSpec.replace(/\s/g, '')}`,
});

const build: PoBBuild = {
  Build: { className: 'Templar', ascendClassName: 'Hierophant', mainSocketGroup: '2' },
  Skills: {
    activeSkillSet: '1',
    SkillSet: {
      id: '1',
      Skill: [
        { slot: 'Weapon 1', mainActiveSkill: '1', Gem: [gem('Purity of Elements')] },
        {
          slot: 'Body Armour',
          mainActiveSkill: '1',
          // A support sits ahead of the second active on purpose.
          Gem: [gem('Crackling Lance'), gem('Spell Echo', true), gem('Shock Nova of Procession')],
        },
      ],
    },
  },
};

const contextFor = (b: PoBBuild): LevelingContext => ({
  getLuaClient: () => null,
  ensureLuaClient: async () => {},
  readBuild: async () => b,
});

describe('handlePlanLeveling', () => {
  it('reads class, ascendancy and main skill from the named build', async () => {
    const result = await handlePlanLeveling(contextFor(build), { build_name: 'zappicus.xml' });

    expect(textOf(result)).toContain('Templar (Hierophant)');
    expect(textOf(result)).toContain('**Main Skill:** Crackling Lance');
  });

  it('honours mainActiveSkill when a group holds several actives', async () => {
    const second = JSON.parse(JSON.stringify(build)) as PoBBuild;
    (second.Skills!.SkillSet as any).Skill[1].mainActiveSkill = '2';

    const result = await handlePlanLeveling(contextFor(second), { build_name: 'zappicus.xml' });

    // Skipping the support means the second active is Shock Nova, not Spell Echo.
    expect(textOf(result)).toContain('**Main Skill:** Shock Nova of Procession');
  });

  it('uses the active skill set rather than the first one', async () => {
    const multi: PoBBuild = {
      Build: { className: 'Witch', ascendClassName: 'Elementalist', mainSocketGroup: '1' },
      Skills: {
        activeSkillSet: '2',
        SkillSet: [
          { id: '1', Skill: [{ mainActiveSkill: '1', Gem: [gem('Freezing Pulse')] }] },
          { id: '2', Skill: [{ mainActiveSkill: '1', Gem: [gem('Arc')] }] },
        ],
      },
    };

    const result = await handlePlanLeveling(contextFor(multi), { build_name: 'multi.xml' });

    expect(textOf(result)).toContain('**Main Skill:** Arc');
  });

  it('lets explicit args override the build file', async () => {
    const result = await handlePlanLeveling(contextFor(build), {
      build_name: 'zappicus.xml',
      main_skill: 'Armageddon Brand',
    });

    expect(textOf(result)).toContain('**Main Skill:** Armageddon Brand');
    expect(textOf(result)).toContain('Templar (Hierophant)');
  });

  it('flags the output as generic when no build could be resolved', async () => {
    const result = await handlePlanLeveling(
      { getLuaClient: () => null, ensureLuaClient: async () => {} },
      {}
    );

    expect(textOf(result)).toContain('No build was resolved');
  });

  it('fails instead of guessing when the named build cannot be read', async () => {
    const context: LevelingContext = {
      getLuaClient: () => null,
      ensureLuaClient: async () => {},
      readBuild: async () => { throw new Error('ENOENT: no such file'); },
    };

    await expect(handlePlanLeveling(context, { build_name: 'missing.xml' }))
      .rejects.toThrow('ENOENT');
  });
});
