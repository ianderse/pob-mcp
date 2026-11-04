import { describe, it, expect } from '@jest/globals';
import { SkillGemService } from '../../src/services/skillGemService';

const build = {
  Skills: {
    SkillSet: {
      Skill: {
        slot: 'Weapon 1',
        Gem: [
          { nameSpec: 'Vortex', level: '20', quality: '20' },
          { nameSpec: 'Trinity Support', level: '20', quality: '0' },
          { nameSpec: 'Elemental Focus Support', level: '20', quality: '0' },
        ],
      },
    },
  },
} as never;

describe('SkillGemService declared conflict detection', () => {
  it('reports the Trinity / Elemental Focus declared anti-synergy', () => {
    const analysis = new SkillGemService().analyzeSkillLinks(build, 0);
    expect(analysis.issues.some((i) => i.includes('conflicts') && i.includes('Elemental Focus'))).toBe(true);
  });
});
