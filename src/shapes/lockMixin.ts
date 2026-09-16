import type { FabricObject } from "#fabric";
import type { LockMode } from "../locking";

const LOCK_MODES: LockMode[] = ["free", "position", "full"];

export interface Lockable {
  lockMode: LockMode;
  lockContent: boolean;
  applyLockMode(mode: LockMode): void;
  getLockMode(): LockMode;
  getNextLockMode(): LockMode;
  isPositionLocked(): boolean;
  isStyleLocked(): boolean;
  isContentLocked(): boolean;
}

/**
 * Install lock methods on a Fabric class prototype.
 * Call once per class at module scope.
 */
export function installLockMethods(proto: any): void {
  proto.applyLockMode = function (this: FabricObject & Lockable, mode: LockMode) {
    this.lockMode = mode;
    const lockPosition = mode === "position" || mode === "full";
    this.lockMovementX = lockPosition;
    this.lockMovementY = lockPosition;
    this.lockRotation = lockPosition;
    this.lockScalingX = lockPosition;
    this.lockScalingY = lockPosition;
    this.hasControls = mode === "free";
    this.lockContent = mode === "full";
  };

  proto.getLockMode = function (this: Lockable): LockMode {
    return this.lockMode || "free";
  };

  proto.getNextLockMode = function (this: Lockable): LockMode {
    const currentIndex = LOCK_MODES.indexOf(this.getLockMode());
    return LOCK_MODES[(currentIndex + 1) % LOCK_MODES.length];
  };

  proto.isPositionLocked = function (this: Lockable): boolean {
    const mode = this.getLockMode();
    return mode === "position" || mode === "full";
  };

  proto.isStyleLocked = function (this: Lockable): boolean {
    const mode = this.getLockMode();
    return mode === "position" || mode === "full";
  };

  proto.isContentLocked = function (this: Lockable): boolean {
    return this.lockContent === true;
  };
}
