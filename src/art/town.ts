// Town hub illustration. CONTRACT STUB — to be implemented.
import type { TownBuildingId } from './types';

/** Town hub illustration (fills a 1280x720 parent) with clickable buildings and ribbon labels. */
export function townScene(_opts: {
  onBuilding: (id: TownBuildingId) => void;
  locked: readonly TownBuildingId[];
  /** Red notification dots. */
  badges?: Partial<Record<TownBuildingId, boolean>>;
}): HTMLElement { throw new Error('not implemented'); }
