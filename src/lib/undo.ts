import { useCallback, useState } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const MAX_HISTORY = 64;

/**
 * Undo/redo history for annotation state. Every mutating action goes through
 * `set`, which pushes the previous snapshot — so highlights, notes, moves,
 * resizes and deletes are all undoable.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({
    past: [],
    present: initial,
    future: [],
  });

  const set = useCallback((fn: (t: T) => T) => {
    setState((s) => ({
      past: [...s.past.slice(-(MAX_HISTORY - 1)), s.present],
      present: fn(s.present),
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      const previous = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { past: [...s.past, s.present], present: next, future: rest };
    });
  }, []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set,
    undo,
    redo,
  };
}
