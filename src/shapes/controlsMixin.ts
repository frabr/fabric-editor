import type { ControlOption } from "../types";

export interface Controllable {
  getControlOptions(): ControlOption[];
}

/**
 * Install getControlOptions() on a Fabric class prototype.
 * Call once per class at module scope.
 */
export function installControlOptions(proto: any, controls: ControlOption[]): void {
  proto.getControlOptions = function (): ControlOption[] {
    return controls;
  };
}
