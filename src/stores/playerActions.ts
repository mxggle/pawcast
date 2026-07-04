import { toast } from "react-hot-toast";
import i18n from "../i18n";
import { usePlayerStore } from "./playerStore";
import { useBookmarkStore } from "./bookmarkStore";
import { useTranscriptStore } from "./transcriptStore";
import { useHistoryStore } from "./historyStore";
import { getNextSentenceSeekTime, getPreviousSentenceSeekTime } from "../utils/sentenceSeek";
import { dataClient } from "../repositories/dataClient";
import type { MediaFile, YouTubeMedia } from "./playerStore";

// Actions that span multiple stores. Components use these instead of the raw
// store setters when the interaction has cross-domain side effects (history
// recording, transcript loading, bookmark-aware looping, sentence seeking).

/** Open a media file: approve its path, record history, and load its transcript. */
export const openFile = async (file: MediaFile | null): Promise<void> => {
  if (file?.nativePath) {
    await dataClient.approvePath(file.nativePath);
  }
  usePlayerStore.getState().setCurrentFile(file);
  if (!file) return;

  const isNativeFile = !!file.nativePath;
  let storageId = file.storageId;
  if (!isNativeFile && !storageId) {
    try {
      const { storeMediaFile } = await import("../utils/mediaStorage");
      const currentId = usePlayerStore.getState().currentFile?.storageId;
      storageId = await storeMediaFile(file as unknown as File, undefined, undefined, currentId ? [currentId] : []);
    } catch (_) { /* ignore */ }
  }
  useHistoryStore.getState().addToMediaHistory({
    type: "file",
    name: file.name,
    fileData: { name: file.name, type: file.type, size: file.size, url: file.url, nativePath: file.nativePath },
    storageId: isNativeFile ? undefined : storageId,
    nativePath: file.nativePath,
  });
  const mediaId = storageId || file.id || `file-${file.name}-${file.size}`;
  useTranscriptStore.getState().loadTranscriptForMedia(mediaId);
};

/** Open a YouTube video: record history and load its transcript. */
export const openYouTube = (youtube: YouTubeMedia | null): void => {
  usePlayerStore.getState().setCurrentYouTube(youtube);
  if (!youtube) return;

  const history = useHistoryStore.getState();
  history.addRecentYouTubeVideo(youtube);
  history.addToMediaHistory({
    type: "youtube",
    name: youtube.title || `YouTube Video: ${youtube.id}`,
    youtubeData: { title: youtube.title, youtubeId: youtube.id },
  });
  if (youtube.id) {
    useTranscriptStore.getState().loadTranscriptForMedia(`youtube-${youtube.id}`);
  }
};

/** Toggle looping; when enabling with no explicit range, loop the bookmark under the playhead. */
export const toggleLooping = (): void => {
  const ps = usePlayerStore.getState();
  if (ps.isLooping) {
    usePlayerStore.setState({ isLooping: false });
    return;
  }
  const bookmarks = useBookmarkStore.getState().getCurrentMediaBookmarks();
  const covering = bookmarks.filter((b) => b.start <= ps.currentTime && b.end >= ps.currentTime);
  if (covering.length > 0) {
    const shortest = covering.reduce((p, c) => (c.end - c.start) < (p.end - p.start) ? c : p);
    usePlayerStore.setState({
      isLooping: true, loopStart: shortest.start, loopEnd: shortest.end, loopCount: 0,
    });
    useBookmarkStore.setState({ selectedBookmarkId: shortest.id });
    toast.success(i18n.t("bookmarks.loopingBookmark", { name: shortest.name }));
    return;
  }
  usePlayerStore.setState({ isLooping: true, loopCount: 0 });
};

/** Seek forward; in sentence mode jump to the next transcript sentence. */
export const seekForward = (seconds: number): void => {
  const ps = usePlayerStore.getState();
  if (ps.seekMode === "sentence") {
    const transcripts = useTranscriptStore.getState().getCurrentMediaTranscripts();
    const nextTime = getNextSentenceSeekTime(transcripts, ps.currentTime);
    if (nextTime !== null) { usePlayerStore.setState({ currentTime: nextTime }); return; }
  }
  ps.seekForward(seconds);
};

/** Seek backward; in sentence mode jump to the previous transcript sentence. */
export const seekBackward = (seconds: number): void => {
  const ps = usePlayerStore.getState();
  if (ps.seekMode === "sentence") {
    const transcripts = useTranscriptStore.getState().getCurrentMediaTranscripts();
    const prevTime = getPreviousSentenceSeekTime(transcripts, ps.currentTime);
    if (prevTime !== null) { usePlayerStore.setState({ currentTime: prevTime }); return; }
  }
  ps.seekBackward(seconds);
};
