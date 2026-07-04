import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { useSettingsStore } from "./stores/settingsStore";
import { usePlayerStore } from "./stores/playerStore";
import { useThemeStore } from "./stores/themeStore";
import { startPersistedStoreSync } from "./stores/persistedStoreSync";
import { startCanonicalSync } from "./stores/canonicalSync";
import { applyTheme } from "./utils/theme";
import { AppRouter } from "./router/AppRouter";
import "./index.css";

function App() {
  const theme = useSettingsStore((state) => state.theme);
  const { colors } = useThemeStore();

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    applyTheme(colors);
  }, [colors]);

  useEffect(() => {
    return startPersistedStoreSync();
  }, []);

  useEffect(() => {
    return startCanonicalSync();
  }, []);

  // Parse URL parameters for shared loop settings
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const start = params.get("start");
    const end = params.get("end");

    if (start && end) {
      const { setLoopPoints, setIsLooping } = usePlayerStore.getState();
      setLoopPoints(parseFloat(start), parseFloat(end));
      setIsLooping(true);
    }

    // Note: YouTube ID handling is implemented in the PlayerLayout component
  }, []);

  return (
    <>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
        <AppRouter />
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: theme === "dark" ? "#2D3748" : "#FFFFFF",
            color: theme === "dark" ? "#FFFFFF" : "#1A202C",
            border:
              theme === "dark" ? "1px solid #4A5568" : "1px solid #E2E8F0",
          },
        }}
      />
    </>
  );
}

export default App;
