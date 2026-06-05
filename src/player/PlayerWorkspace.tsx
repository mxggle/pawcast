import { useState, useCallback, type ReactNode } from 'react';
import { playbackClock } from './PlaybackClock';
import type { TimeRangeSelection } from './types';
import { PlayerWorkspaceContext, PlayerSelectionContext } from './hooks';

export function PlayerWorkspace({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<TimeRangeSelection | null>(null);
  const stableSetSelection = useCallback(
    (sel: TimeRangeSelection | null) => setSelection(sel),
    []
  );

  return (
    <PlayerWorkspaceContext.Provider value={{ clock: playbackClock }}>
      <PlayerSelectionContext.Provider
        value={{ selection, setSelection: stableSetSelection }}
      >
        {children}
      </PlayerSelectionContext.Provider>
    </PlayerWorkspaceContext.Provider>
  );
}
