/**
 * Thin abstraction over HTMLMediaElement.
 * Separates playback control from React rendering so the media element
 * can be driven imperatively without triggering React re-renders.
 */
export class MediaController {
  private media: HTMLMediaElement;

  constructor(media: HTMLMediaElement) {
    this.media = media;
  }

  play(): Promise<void> {
    return this.media.play();
  }

  pause(): void {
    this.media.pause();
  }

  seek(time: number): void {
    this.media.currentTime = time;
  }

  getCurrentTime(): number {
    return this.media.currentTime;
  }

  getDuration(): number {
    return this.media.duration;
  }

  setPlaybackRate(rate: number): void {
    this.media.playbackRate = rate;
  }

  getPlaybackRate(): number {
    return this.media.playbackRate;
  }

  setVolume(volume: number): void {
    this.media.volume = volume;
  }

  getVolume(): number {
    return this.media.volume;
  }

  setMuted(muted: boolean): void {
    this.media.muted = muted;
  }

  get isPaused(): boolean {
    return this.media.paused;
  }

  get isEnded(): boolean {
    return this.media.ended;
  }

  get readyState(): number {
    return this.media.readyState;
  }

  getElement(): HTMLMediaElement {
    return this.media;
  }

  /** Replace the underlying media element (e.g., when switching between audio/video). */
  swapElement(media: HTMLMediaElement): void {
    this.media = media;
  }
}
