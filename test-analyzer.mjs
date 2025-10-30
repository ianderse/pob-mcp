import { analyzeDefenses, formatDefensiveAnalysis } from './build/defensiveAnalyzer.js';

// Mock stats from a typical wander build
const mockStats = {
  Life: 3800,
  EnergyShield: 1200,
  Mana: 800,
  TotalDPS: 450000,
  FireResist: 75,
  ColdResist: 75,
  LightningResist: 62,  // Uncapped!
  ChaosResist: -15,
  Armour: 1200,
  Evasion: 15000,
  BlockChance: 0,
  SpellBlockChance: 0,
  LifeRegen: 200,
  ManaRegen: 120,
  ESRecharge: 400,
};

console.log('Testing Defensive Analyzer with mock wander stats...\n');

const analysis = analyzeDefenses(mockStats);
const formatted = formatDefensiveAnalysis(analysis);

console.log(formatted);

// Also output JSON for inspection
console.log('\n=== JSON Analysis ===');
console.log(JSON.stringify(analysis, null, 2));
