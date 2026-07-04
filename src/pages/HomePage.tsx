import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayerStore } from "../stores/playerStore";
import { openYouTube } from "../stores/playerActions";
import { AppLayout } from "../components/layout/AppLayout";
import { DesktopHomePage } from "./DesktopHomePage";

export const HomePage = () => {
  const navigate = useNavigate();
  const { currentFile, currentYouTube } = usePlayerStore();

  // Navigate to player when media is loaded
  useEffect(() => {
    if (currentFile || currentYouTube) {
      navigate("/player");
    }
  }, [currentFile, currentYouTube, navigate]);

  // Handle YouTube video ID submission
  const handleVideoIdSubmit = (videoId: string) => {
    openYouTube({ id: videoId });
  };

  return (
    <AppLayout bottomPaddingClassName="pb-0">
      <DesktopHomePage handleVideoIdSubmit={handleVideoIdSubmit} />
    </AppLayout>
  );
};
