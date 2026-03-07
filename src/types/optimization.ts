export interface OptimizationConstraints {
  minLife?: number;
  minES?: number;
  minEHP?: number;
  minFireResist?: number;
  minColdResist?: number;
  minLightningResist?: number;
  minChaosResist?: number;
  protectedNodes?: string[];  // Node IDs that cannot be removed
}

export interface OptimizationResult {
  goal: string;
  goalDescription: string;
  buildName: string;
  startingStats: {
    targetValue: number;
    life: number;
    es: number;
    dps: number;
    pointsAllocated: number;
  };
  finalStats: {
    targetValue: number;
    life: number;
    es: number;
    dps: number;
    pointsAllocated: number;
  };
  improvements: {
    targetValueGain: number;
    targetValuePercent: number;
    lifeChange: number;
    esChange: number;
    dpsChange: number;
    pointsChange: number;
  };
  iterations: number;
  nodesAdded: string[];
  nodesRemoved: string[];
  constraintsMet: boolean;
  warnings: string[];
  formattedTree: {
    classId: number;
    ascendClassId: number;
    nodes: number[];
  };
}

export type OptimizationGoal =
  | 'maximize_dps'
  | 'maximize_life'
  | 'maximize_es'
  | 'maximize_ehp'
  | 'balanced'
  | 'league_start';
