// Passive Tree Data Interfaces
export interface PassiveTreeNode {
  skill: number;
  name?: string;
  icon?: string;
  stats?: string[];
  isKeystone?: boolean;
  isNotable?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  isAscendancyStart?: boolean;
  ascendancyName?: string;
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  out?: string[];
  in?: string[];
  reminderText?: string[];
  flavourText?: string[];
}

export interface PassiveTreeData {
  nodes: Map<string, PassiveTreeNode>;
  version: string;
  classes?: any[];
  groups?: any[];
}

export interface TreeDataCache {
  data: PassiveTreeData;
  timestamp: number;
}

// Path of Building build interface
export interface PoBBuild {
  Build?: {
    level?: string;
    className?: string;
    ascendClassName?: string;
    bandit?: string;
    PlayerStat?: Array<{stat: string; value: string}> | {stat: string; value: string};
  };
  Tree?: {
    activeSpec?: string;
    Spec?: {
      title?: string;
      URL?: string;
      nodes?: string;
      treeVersion?: string;
    } | Array<{
      title?: string;
      URL?: string;
      nodes?: string;
      treeVersion?: string;
    }>;
  };
  Skills?: {
    SkillSet?: {
      Skill?: Array<{
        enabled?: string;
        Gem?: Array<{name?: string; level?: string; quality?: string}>;
      }>;
    };
  };
  Items?: {
    ItemSet?: {
      Slot?: Array<{
        name?: string;
        Item?: string;
        active?: string | boolean;
        itemId?: string;
      }>;
    };
  };
  Notes?: string;
  Config?: {
    activeConfigSet?: string;
    ConfigSet?: ConfigSet | ConfigSet[];
  };
}

// Configuration State Interfaces
export interface ConfigInput {
  name: string;
  // XML attributes - only one will be present per input
  boolean?: string | boolean;
  number?: string | number;
  string?: string;
}

export interface ConfigSet {
  id?: string;
  title?: string;
  Input?: ConfigInput | ConfigInput[];
  Placeholder?: ConfigInput | ConfigInput[];
}

export interface ParsedConfiguration {
  activeConfigSetId: string;
  activeConfigSetTitle: string;
  chargeUsage: {
    powerCharges: boolean;
    frenzyCharges: boolean;
    enduranceCharges: boolean;
  };
  conditions: {
    [key: string]: boolean;
  };
  customMods: string;
  enemySettings: {
    level?: number;
    lightningResist?: number;
    coldResist?: number;
    fireResist?: number;
    chaosResist?: number;
    armour?: number;
    evasion?: number;
    [key: string]: any;
  };
  multipliers: {
    [key: string]: number;
  };
  bandit?: string;
  allInputs: Map<string, ConfigInput>;
}

// Build cache entry interface
export interface CachedBuild {
  data: PoBBuild;
  timestamp: number;
}

// Phase 2: Optimization Suggestion Interfaces
export interface PathOptimization {
  destination: string;
  currentLength: number;
  optimalLength: number;
  pointsSaved: number;
  suggestion: string;
}

export interface EfficiencyScore {
  nodeId: string;
  nodeName: string;
  statsPerPoint: number;
  isLowValue: boolean;
}

export interface OptimizationSuggestion {
  type: 'path' | 'efficiency' | 'reachable' | 'ai-context';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  pointsSaved?: number;
  potentialGain?: string;
}

// Tree Analysis Results
export interface TreeAnalysisResult {
  totalPoints: number;
  availablePoints: number;
  allocatedNodes: PassiveTreeNode[];
  keystones: PassiveTreeNode[];
  notables: PassiveTreeNode[];
  jewels: PassiveTreeNode[];
  normalNodes: PassiveTreeNode[];
  archetype: string;
  archetypeConfidence: string;
  pathingEfficiency: string;
  buildVersion?: string;
  treeVersion: string;
  versionMismatch: boolean;
  invalidNodeIds: string[];
  optimizationSuggestions?: OptimizationSuggestion[];
}

// Phase 3: Tree Comparison Interface
export interface TreeComparison {
  build1: {
    name: string;
    analysis: TreeAnalysisResult;
  };
  build2: {
    name: string;
    analysis: TreeAnalysisResult;
  };
  differences: {
    uniqueToBuild1: PassiveTreeNode[];
    uniqueToBuild2: PassiveTreeNode[];
    sharedNodes: PassiveTreeNode[];
    pointDifference: number;
    archetypeDifference: string;
  };
}

// Phase 3: Allocation Change Interface
export interface AllocationChange {
  type: 'allocate' | 'remove';
  nodeIdentifier: string;
  node?: PassiveTreeNode;
}

// Flask System Interfaces
export interface Flask {
  id: string;
  slotNumber: number; // 1-5
  isActive: boolean;
  rarity: 'NORMAL' | 'MAGIC' | 'RARE' | 'UNIQUE';
  name: string;
  baseType: string;
  quality: number;
  levelRequirement: number;
  prefix?: string;
  suffix?: string;
  mods: string[];
  isUnique: boolean;
  variant?: string;
}

export interface FlaskAnalysis {
  totalFlasks: number;
  activeFlasks: number;
  flasks: Flask[];
  flaskTypes: {
    life: number;
    mana: number;
    hybrid: number;
    utility: number;
  };
  hasBleedImmunity: boolean;
  hasFreezeImmunity: boolean;
  hasPoisonImmunity: boolean;
  hasCurseImmunity: boolean;
  uniqueFlasks: string[];
  warnings: string[];
  recommendations: string[];
}
