import type { PoBLuaApiClient } from "../pobLuaBridge.js";
import { wrapHandler } from "../utils/errorHandling.js";

export interface BossReadinessContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

interface BossThreshold {
  name: string;
  minLife: number;
  minDPS: number;
  minEHP: number;
  notes: string[];
  mechanics: string[];
}

const BOSS_THRESHOLDS: Record<string, BossThreshold> = {
  shaper: {
    name: 'The Shaper',
    minLife: 5000, minDPS: 1_000_000, minEHP: 30_000,
    notes: ['75% elemental resists required', 'High cold damage — spell suppression/dodge helps'],
    mechanics: ['Stand in rotating beam = instant death', 'Move out of Shaper Slam circle', 'Ice prison requires ES or granite flask'],
  },
  elder: {
    name: 'The Elder',
    minLife: 5000, minDPS: 800_000, minEHP: 25_000,
    notes: ['75% elemental + 0%+ chaos recommended', 'DoT phases require recovery layers'],
    mechanics: ['Spiral of storms — keep moving', 'Tentacle Miscreations must be killed quickly'],
  },
  sirus: {
    name: 'Sirus, Awakener of Worlds',
    minLife: 5500, minDPS: 2_000_000, minEHP: 35_000,
    notes: ['Phase 4 meteors are one-shots without positioning', 'Chaos resistance strongly recommended (60%+ ideal)'],
    mechanics: ['Die beams — walk between the lines', 'Maze phase — follow correct portals', 'Corridor phase — avoid tunnel walls'],
  },
  maven: {
    name: 'The Maven',
    minLife: 6000, minDPS: 3_000_000, minEHP: 40_000,
    notes: ['Memory game insta-kills on failure', 'Very high damage output in final phases'],
    mechanics: ['Memory game — memorise the sequence and repeat it', 'Avoid brain phases', 'Maven orbs — stay mobile'],
  },
  uber_elder: {
    name: 'Uber Elder',
    minLife: 6000, minDPS: 1_500_000, minEHP: 40_000,
    notes: ['Dual-boss encounter — constant movement required', 'Cold snap ground persists and covers the arena'],
    mechanics: ['Avoid Elder circle and Shaper beams simultaneously', 'High DPS window when Shaper kneels'],
  },
  eater: {
    name: 'Eater of Worlds (Uber)',
    minLife: 6000, minDPS: 4_000_000, minEHP: 50_000,
    notes: ['Physical damage primary — armour/PDR very valuable', 'Tentacles apply stacking debuffs'],
    mechanics: ['Move to remove tentacle stacks', 'Dodge projectile waves'],
  },
  exarch: {
    name: 'Searing Exarch (Uber)',
    minLife: 6000, minDPS: 4_000_000, minEHP: 50_000,
    notes: ['Fire/cold damage — suppression + capped resists required', 'Phases escalate significantly'],
    mechanics: ['Avoid meteor impact zones', 'Kill adds quickly during add phase'],
  },
  pinnacle: {
    name: 'Generic Pinnacle Boss',
    minLife: 6000, minDPS: 3_000_000, minEHP: 40_000,
    notes: ['General endgame readiness check'],
    mechanics: ['Capped resistances essential', 'Flask immunities (bleed, freeze, poison) required'],
  },
};

const BOSS_ALIASES: Record<string, string> = {
  'uber shaper': 'shaper',
  'uber maven': 'maven',
  'awakener': 'sirus',
  'searing exarch': 'exarch',
  'eater of worlds': 'eater',
  'endgame': 'pinnacle',
  'generic': 'pinnacle',
};

export async function handleCheckBossReadiness(context: BossReadinessContext, boss: string) {
  return wrapHandler('check boss readiness', async () => {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_load_build first.');

  const key = BOSS_ALIASES[boss.toLowerCase()] ?? boss.toLowerCase().replace(/\s+/g, '_');
  const threshold = BOSS_THRESHOLDS[key] ?? BOSS_THRESHOLDS['pinnacle'];

  const stats = await luaClient.getStats([
    'Life', 'TotalEHP', 'EnergyShield',
    'TotalDPS', 'CombinedDPS', 'MinionTotalDPS',
    'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist',
    'EffectiveSpellSuppressionChance', 'SpellSuppressionChance',
    'Armour', 'PhysicalDamageReduction', 'EvasionChance',
  ]);

  const life = Number(stats.Life ?? 0);
  const ehp = Number(stats.TotalEHP ?? life);
  const dps = Number(stats.CombinedDPS || stats.TotalDPS || stats.MinionTotalDPS || 0);
  const fireRes = Number(stats.FireResist ?? -60);
  const coldRes = Number(stats.ColdResist ?? -60);
  const lightRes = Number(stats.LightningResist ?? -60);
  const chaosRes = Number(stats.ChaosResist ?? -60);

  interface StatCheck {
    label: string;
    value: string;
    pass: boolean;
    critical: boolean;
  }

  const checks: StatCheck[] = [
    {
      label: 'Life',
      value: life.toLocaleString(),
      pass: life >= threshold.minLife,
      critical: life < threshold.minLife * 0.7,
    },
    {
      label: 'Effective HP',
      value: ehp.toLocaleString(),
      pass: ehp >= threshold.minEHP,
      critical: ehp < threshold.minEHP * 0.6,
    },
    {
      label: 'DPS',
      value: dps.toLocaleString(),
      pass: dps >= threshold.minDPS,
      critical: dps < threshold.minDPS * 0.3,
    },
    ...(['Fire', 'Cold', 'Lightning'] as const).map(elem => {
      const val = elem === 'Fire' ? fireRes : elem === 'Cold' ? coldRes : lightRes;
      return { label: `${elem} Resist`, value: `${val}%`, pass: val >= 75, critical: val < 50 };
    }),
    {
      label: 'Chaos Resist',
      value: `${chaosRes}%`,
      pass: chaosRes >= 0,
      critical: chaosRes < -30,
    },
  ];

  const passed = checks.filter(c => c.pass).length;
  const criticalFails = checks.filter(c => !c.pass && c.critical);
  const minorFails = checks.filter(c => !c.pass && !c.critical);
  const ready = passed === checks.length;

  let output = `=== Boss Readiness: ${threshold.name} ===\n\n`;
  output += ready
    ? `✅ **READY** — all ${checks.length} checks pass\n\n`
    : `❌ **NOT READY** — ${checks.length - passed}/${checks.length} checks failed\n\n`;

  output += '**Stat Checks:**\n';
  for (const c of checks) {
    const icon = c.pass ? '✅' : c.critical ? '🔴' : '🟡';
    const req =
      c.label === 'Life'         ? ` (need ${threshold.minLife.toLocaleString()}+)` :
      c.label === 'Effective HP' ? ` (need ${threshold.minEHP.toLocaleString()}+)` :
      c.label === 'DPS'          ? ` (need ~${threshold.minDPS.toLocaleString()}+)` :
      c.label !== 'Chaos Resist' ? ' (need 75%)' : ' (need 0%+)';
    output += `  ${icon} ${c.label}: ${c.value}${req}\n`;
  }

  if (criticalFails.length > 0) {
    output += `\n**Critical Gaps (fix before attempting):**\n`;
    for (const f of criticalFails) output += `  🔴 ${f.label} is dangerously low\n`;
  }
  if (minorFails.length > 0) {
    output += `\n**Recommended Improvements:**\n`;
    for (const f of minorFails) output += `  🟡 ${f.label} below threshold\n`;
  }

  output += `\n**Boss-Specific Notes:**\n`;
  for (const note of threshold.notes) output += `  - ${note}\n`;
  output += `\n**Key Mechanics to Know:**\n`;
  for (const m of threshold.mechanics) output += `  - ${m}\n`;

  return { content: [{ type: 'text' as const, text: output }] };
  });
}
