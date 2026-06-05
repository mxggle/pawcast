import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, memo } from "react";
import { HomePage } from "../pages";
import { usePlayerStore } from "../stores/playerStore";
import { useShallow } from "zustand/react/shallow";

const Router = HashRouter;
const PlayerPage = lazy(async () => {
  const module = await import("../pages/PlayerPage");
  return { default: module.PlayerPage };
});
const SettingsPage = lazy(async () => {
  const module = await import("../pages/SettingsPage");
  return { default: module.SettingsPage };
});
const GlossaryPage = lazy(async () => {
  const module = await import("../pages/GlossaryPage");
  return { default: module.GlossaryPage };
});
const SettingsWindowPage = lazy(async () => {
  const module = await import("../pages/ElectronSettingsWindowPage");
  return { default: module.ElectronSettingsWindowPage };
});
const GlossaryWindowPage = lazy(async () => {
  const module = await import("../pages/ElectronGlossaryWindowPage");
  return { default: module.ElectronGlossaryWindowPage };
});
const SentencePracticePage = lazy(async () => {
  const module = await import("../pages/SentencePracticePage");
  return { default: module.SentencePracticePage };
});

// Static object — same reference on every render, so React's style diffing is a no-op
// when visibility doesn't change.
const HIDDEN_STYLE: React.CSSProperties = {
  position: "fixed",
  left: "-9999px",
  top: 0,
  width: "100%",
  pointerEvents: "none",
};

const ROUTE_FALLBACK = (
  <div className="flex min-h-[24rem] items-center justify-center" aria-label="Loading page">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600 dark:border-gray-700 dark:border-t-primary-400" />
  </div>
);

// Memoized so it never re-renders due to AppRouterInner re-renders on route change.
// PlayerPage has no props — all data flows through store hooks — so memo is safe here.
// Without this, every route navigation causes PlayerPage + all transcript segments to re-render.
const PersistentPlayer = memo(() => <PlayerPage />);

const AppRouterInner = () => {
  const location = useLocation();
  const { currentFile, currentYouTube } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      currentYouTube: state.currentYouTube,
    }))
  );

  const hasMedia = !!(currentFile || currentYouTube);
  const isOnPlayer = location.pathname === "/player";
  const isPopupWindow =
    location.pathname === "/glossary-window" ||
    location.pathname === "/settings-window";

  return (
    <>
      <Suspense fallback={ROUTE_FALLBACK}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/glossary" element={<GlossaryPage />} />
          <Route path="/glossary-window" element={<GlossaryWindowPage />} />
          <Route path="/settings-window" element={<SettingsWindowPage />} />
          <Route path="/sentence-practice" element={<SentencePracticePage />} />
          {/* When media is loaded, player is rendered persistently below; otherwise redirect home */}
          <Route
            path="/player"
            element={hasMedia ? null : <Navigate to="/" replace />}
          />
          <Route path="/ai-settings" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>

      {/* Keep PlayerPage mounted while media is loaded so audio element and state persist.
          PersistentPlayer (memo) skips re-render on route change — only the wrapper div's
          style prop is updated (a fast direct DOM write, not a React subtree reconciliation). */}
      {hasMedia && !isPopupWindow && (
        <Suspense fallback={isOnPlayer ? ROUTE_FALLBACK : null}>
          <div style={isOnPlayer ? undefined : HIDDEN_STYLE}>
            <PersistentPlayer />
          </div>
        </Suspense>
      )}
    </>
  );
};

export const AppRouter = () => {
  return (
    <Router>
      <AppRouterInner />
    </Router>
  );
};
