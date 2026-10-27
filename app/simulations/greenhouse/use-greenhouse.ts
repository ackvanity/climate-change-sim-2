'use client';

import { useEffect, useState } from 'react';
import {
  NUM_LAYERS,
  loadGreenhouse,
  type Greenhouse,
} from '@/interface/greenhouse/greenhouse';
import { mockGreenhouse } from '@/interface/greenhouse/mock';

export interface GreenhouseSolver {
  solver: Greenhouse;
  /** True while the stand-in model is in use (WASM not built, or solver returns no profile yet). */
  isMock: boolean;
}

/** Loads the WASM solver, falling back to the mock model if it is unavailable or incomplete. */
export function useGreenhouse(): GreenhouseSolver {
  const [state, setState] = useState<GreenhouseSolver>({
    solver: mockGreenhouse,
    isMock: true,
  });

  useEffect(() => {
    let cancelled = false;
    loadGreenhouse()
      .then((real) => {
        if (real.solve(420, 1.9).length === NUM_LAYERS + 1 && !cancelled)
          setState({ solver: real, isMock: false });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
