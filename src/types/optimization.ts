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
