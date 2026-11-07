'use client';

import { useEffect, useState } from 'react';
import { loadUrban, type Urban } from '@/interface/urban/urban';

export interface UrbanSolver {
  /** The WASM solver once loaded; `null` while loading or when it failed. */
  urban: Urban | null;
  /** Why loading failed (module or table missing/invalid). */
  error: string | null;
}

/** Loads the WASM solver and its heat-transfer table. */
export function useUrban(): UrbanSolver {
  const [state, setState] = useState<UrbanSolver>({ urban: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loadUrban()
      .then((urban) => {
        if (!cancelled) setState({ urban, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            urban: null,
            error: e instanceof Error ? e.message : String(e),
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
