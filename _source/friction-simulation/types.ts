
export enum SimulationPhase {
  STATIC_NO_FORCE,
  STATIC_APPLYING_FORCE,
  KINETIC_MOTION,
}

export interface FrictionDataPoint {
  applied: number;
  friction: number;
}
