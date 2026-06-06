import { useTranslation } from "react-i18next";
import { YouTubeInput } from "../components/player/YouTubeInput";
import { ElectronFileOpener } from "../components/electron/ElectronFileOpener";
import { motion } from "framer-motion";
import { Youtube, FileAudio, FolderOpen, History, Music, Video } from "lucide-react";
import { DesktopCard } from "../components/ui/DesktopCard";
import { usePlayerStore } from "../stores/playerStore";
import { formatTime } from "../utils/formatTime";


interface ElectronHomePageProps {
  handleVideoIdSubmit: (videoId: string) => void;
}

export const ElectronHomePage = ({ handleVideoIdSubmit }: ElectronHomePageProps) => {
  const { t } = useTranslation();
  const { mediaHistory, loadFromHistory, addSourceFolder } = usePlayerStore();

  const handleOpenFolder = async () => {
    const selected = await window.electronAPI!.openFolder();
    if (selected) {
      addSourceFolder(selected);
    }
  };

  const recentItems = mediaHistory.slice(0, 4);

  return (
    <div className="flex-1 min-h-full flex flex-col relative overflow-hidden">
      {/* Radial gradient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50/80 via-white to-amber-100/60 dark:from-amber-950/30 dark:via-[#0a0a1a] dark:to-amber-900/20" />
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-400/10 dark:bg-amber-500/5 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-orange-300/10 dark:bg-orange-600/5 blur-3xl" />
      </div>

      {/* Main Canvas - Studio Hero */}
      <motion.main 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="px-8 py-12 lg:px-12 flex-1 flex flex-col relative z-10"
      >
        <div className="max-w-6xl mx-auto w-full space-y-12">
          {/* Logo + Hero */}
          <div className="space-y-6 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
              className="flex justify-center"
            >
              <img
                src="/logo.png"
                alt="Pawcast"
                className="w-24 h-24 md:w-28 md:h-28 object-contain drop-shadow-lg"
              />
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl font-black tracking-tight text-gray-900 dark:text-white"
            >
              {t("home.startPracticing", "Start Practicing")}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-base text-gray-500 dark:text-gray-400 max-w-2xl leading-relaxed mx-auto md:mx-0"
            >
              {t("home.studioDesc", "Open a local media file or stream from YouTube to begin your language mastery session.")}
            </motion.p>
          </div>

          {/* Unified Launcher Canvas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Open File */}
            <motion.div 
              whileHover={{ y: -5 }}
              className="group relative"
            >
              <DesktopCard className="p-8 h-full flex flex-col transition-all group-hover:border-primary-500/30 group-hover:shadow-2xl group-hover:shadow-primary-500/5">
                <div className="mb-6 flex items-center justify-between">
                  <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center text-primary-600 dark:text-primary-400 group-hover:scale-110 transition-transform">
                    <FileAudio className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-primary-500 transition-colors">{t("home.localFile")}</span>
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-800 dark:text-white">
                  {t("upload.openFile", "Open File")}
                </h3>
                <div className="flex-1 flex flex-col justify-center py-2">
                  <div className="uploader-studio-override">
                    <ElectronFileOpener />
                  </div>
                </div>
              </DesktopCard>
            </motion.div>

            {/* Open Folder */}
            <motion.div 
              whileHover={{ y: -5 }}
              className="group relative"
            >
              <DesktopCard className="p-8 h-full flex flex-col transition-all group-hover:border-accent-500/30 group-hover:shadow-2xl group-hover:shadow-accent-500/5">
                <div className="mb-6 flex items-center justify-between">
                  <div className="w-12 h-12 bg-accent-50 dark:bg-accent-900/30 rounded-2xl flex items-center justify-center text-accent-600 dark:text-accent-400 group-hover:scale-110 transition-transform">
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-accent-500 transition-colors">{t("sidebar.explorer", "Explorer")}</span>
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-800 dark:text-white">
                  {t("sidebar.addFolder", "Add Folder")}
                </h3>
                <div className="flex-1 flex flex-col justify-center py-2">
                  <button
                    onClick={handleOpenFolder}
                    className="w-full h-32 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-all group/btn"
                  >
                    <FolderOpen className="w-8 h-8 text-gray-300 dark:text-gray-600 group-hover/btn:text-accent-500 transition-colors" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("sidebar.addFolder", "Select a folder to browse")}</span>
                  </button>
                </div>
              </DesktopCard>
            </motion.div>

            {/* YouTube Entry */}
            <motion.div 
              whileHover={{ y: -5 }}
              className="group relative"
            >
              <DesktopCard className="p-8 h-full flex flex-col transition-all group-hover:border-error-500/30 group-hover:shadow-2xl group-hover:shadow-error-500/5">
                <div className="mb-6 flex items-center justify-between">
                  <div className="w-12 h-12 bg-red-50 dark:bg-error-900/30 rounded-2xl flex items-center justify-center text-error-600 dark:text-error-400 group-hover:scale-110 transition-transform">
                    <Youtube className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-error-500 transition-colors">{t("home.cloudStream")}</span>
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-800 dark:text-white">
                  {t("home.youtubeVideo")}
                </h3>
                <div className="flex-1 flex flex-col justify-center py-2">
                  <div className="youtube-studio-override">
                    <YouTubeInput onVideoIdSubmit={handleVideoIdSubmit} />
                  </div>
                </div>
              </DesktopCard>
            </motion.div>
          </div>

          {/* Recent Items Section */}
          {recentItems.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-gray-400" />
                  <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    {t("sidebar.recent", "Recent Items")}
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {recentItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadFromHistory(item.id)}
                    className="group text-left"
                  >
                    <DesktopCard className="p-4 h-full border-black/5 dark:border-white/5 bg-white/40 dark:bg-gray-900/40 hover:bg-white dark:hover:bg-gray-900 transition-all hover:shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 group-hover:bg-primary-500 group-hover:text-white transition-all">
                          {item.type === "youtube" ? (
                            <Youtube className="w-4 h-4" />
                          ) : item.fileData?.type.includes("video") ? (
                            <Video className="w-4 h-4" />
                          ) : (
                            <Music className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                            {item.name}
                          </p>
                          <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5">
                            {item.playbackTime ? (
                              <>
                                <span className="text-primary-500/70">{formatTime(item.playbackTime)}</span>
                                <span className="opacity-30">•</span>
                              </>
                            ) : null}
                            <span>{new Date(item.accessedAt).toLocaleDateString()}</span>
                          </p>
                        </div>
                      </div>
                    </DesktopCard>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </motion.main>
      
      {/* Visual Overrides */}
      <style>{`
        .uploader-studio-override .border-dashed {
          border-radius: 1rem !important;
          background: rgba(0,0,0,0.02) !important;
          border-width: 1px !important;
        }
        .dark .uploader-studio-override .border-dashed {
          background: rgba(255,255,255,0.02) !important;
        }
      `}</style>
    </div>
  );
};

