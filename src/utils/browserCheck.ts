/**
 * Utility functions for checking browser capabilities.
 * Electron-only app — all checks return Electron defaults.
 */

export interface BrowserCapabilities {
    supportsMediaRecorder: boolean;
    supportsGetUserMedia: boolean;
    supportsAudioRecording: boolean;
    browserName: string;
    isMobile: boolean;
}

export function checkAudioRecordingSupport(): BrowserCapabilities {
    const supportsGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const supportsMediaRecorder = typeof MediaRecorder !== 'undefined';
    const supportsAudioRecording = supportsGetUserMedia;

    return {
        supportsMediaRecorder,
        supportsGetUserMedia,
        supportsAudioRecording,
        browserName: 'Electron',
        isMobile: false,
    };
}

export function getRecordingUnsupportedMessage(capabilities: BrowserCapabilities): string {
    const { supportsGetUserMedia } = capabilities;

    if (!supportsGetUserMedia) {
        return 'Your browser does not support microphone access. Please use a modern browser like Chrome, Firefox, Safari, or Edge.';
    }

    return 'Audio recording is not supported in your browser. Please update to the latest version or try a different browser.';
}
