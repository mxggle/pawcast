import { createContext, useContext } from 'react';
import { playbackClock, PlaybackClock } from './PlaybackClock';
import type { TimeRangeSelection } from './types';

export interface PlayerWorkspaceContextValue {
  clock: PlaybackClock;
}

export interface PlayerSelectionContextValue {
  selection: TimeRangeSelection | null;
  setSelection: (sel: TimeRangeSelection | null) => void;
}

export const PlayerWorkspaceContext = createContext<PlayerWorkspaceContextValue>({
  clock: playbackClock,
});

export const PlayerSelectionContext = createContext<PlayerSelectionContextValue>({
  selection: null,
  setSelection: () => {},
});

export function usePlayerWorkspace(): PlayerWorkspaceContextValue {
  return useContext(PlayerWorkspaceContext);
}

export function usePlayerSelection(): PlayerSelectionContextValue {
  return useContext(PlayerSelectionContext);
}
