/**
 * Unified Transcription Service
 *
 * Supports multiple transcription providers:
 * - OpenAI Whisper (whisper-1)
 * - Groq Whisper (whisper-large-v3-turbo) — OpenAI-compatible API
 * - Google Gemini (generateContent with audio)
 */

import OpenAI from "openai";
import { TranscriptionProvider, TRANSCRIPTION_PROVIDERS } from "../types/aiService";
import { encodeWAV } from "../utils/wavEncoder";
import { buildChunkRanges, dedupeOverlappingSegments } from "../utils/transcriptionChunks";

// --- Types ---

export interface TranscriptionSegment {
    id: number;
    text: string;
    start: number;
    end: number;
    confidence: number;
}

export interface TranscriptionResult {
    segments: TranscriptionSegment[];
    fullText: string;
    language?: string;
    duration?: number;
    provider: TranscriptionProvider;
    words?: Array<{ word: string; start: number; end: number }>;
}

export interface TranscriptionConfig {
    provider: TranscriptionProvider;
    apiKey: string;
    language?: string; // e.g., "en", "ja"
}

export interface TranscriptionRequestOptions {
    signal?: AbortSignal;
}

export interface ChunkedTranscriptionProgress {
    chunkIndex: number;
    totalChunks: number;
    progress: number;
}

export interface ChunkedTranscriptionOptions extends TranscriptionRequestOptions {
    chunkDurationSeconds?: number;
    overlapSeconds?: number;
    onChunkComplete: (
        segments: TranscriptionSegment[],
        chunkIndex: number,
        totalChunks: number
    ) => void;
    onProgress?: (progress: ChunkedTranscriptionProgress) => void;
}

// Raw Whisper response types (shared by OpenAI and Groq)
interface WhisperSegment {
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
}

interface WhisperVerboseResponse {
    task: string;
    language: string;
    duration: number;
    text: string;
    segments: WhisperSegment[];
    words?: Array<{ word: string; start: number; end: number }>;
}

function normalizeWhisperLanguageCode(language?: string): string | undefined {
    const normalizedLanguage = language?.trim().replace("_", "-");
    if (!normalizedLanguage) {
        return undefined;
    }

    return normalizedLanguage.split("-")[0].toLowerCase();
}

// --- Service ---

class TranscriptionService {
    private static instance: TranscriptionService;

    public static getInstance(): TranscriptionService {
        if (!TranscriptionService.instance) {
            TranscriptionService.instance = new TranscriptionService();
        }
        return TranscriptionService.instance;
    }

    /**
     * Main entry point — transcribe audio using the configured provider.
     */
    public async transcribe(
        config: TranscriptionConfig,
        audioBlob: Blob,
        options: TranscriptionRequestOptions = {}
    ): Promise<TranscriptionResult> {
        if (!config.apiKey && config.provider !== "local-whisper") {
            throw new Error(`API key is required for ${config.provider} transcription`);
        }

        switch (config.provider) {
            case "openai":
                return this.transcribeWithOpenAI(config, audioBlob, options);
            case "groq":
                return this.transcribeWithGroq(config, audioBlob, options);
            case "gemini":
                return this.transcribeWithGemini(config, audioBlob, options);
            case "local-whisper":
                return this.transcribeWithLocalWhisper(config, audioBlob, options);
            default:
                throw new Error(`Unsupported transcription provider: ${config.provider}`);
        }
    }

    public async transcribeInChunks(
        config: TranscriptionConfig,
        audioBlob: Blob,
        options: ChunkedTranscriptionOptions
    ): Promise<TranscriptionResult> {
        const chunkDurationSeconds = options.chunkDurationSeconds ?? 120;
        const overlapSeconds = options.overlapSeconds ?? 5;
        const audioBuffer = await this.decodeAudioBlob(audioBlob);
        const ranges = buildChunkRanges(
            audioBuffer.duration,
            chunkDurationSeconds,
            overlapSeconds
        );
        const acceptedSegments: TranscriptionSegment[] = [];
        const fullTextParts: string[] = [];

        for (let index = 0; index < ranges.length; index++) {
            this.throwIfAborted(options.signal);

            const range = ranges[index];
            const chunkBlob = this.encodeAudioBufferRange(audioBuffer, range.start, range.end);
            const chunkResult = await this.transcribe(config, chunkBlob, {
                signal: options.signal,
            });
            const offsetSegments = chunkResult.segments.map((segment, segmentIndex) => ({
                ...segment,
                id: acceptedSegments.length + segmentIndex,
                start: segment.start + range.start,
                end: segment.end + range.start,
            }));
            const acceptedChunkSegments = dedupeOverlappingSegments(
                acceptedSegments,
                offsetSegments,
                { chunkStart: range.start, overlapSeconds }
            ).map((segment, segmentIndex) => ({
                ...segment,
                id: acceptedSegments.length + segmentIndex,
            }));

            acceptedSegments.push(...acceptedChunkSegments);
            fullTextParts.push(...acceptedChunkSegments.map((segment) => segment.text));

            const chunkIndex = index + 1;
            options.onChunkComplete(acceptedChunkSegments, chunkIndex, ranges.length);
            options.onProgress?.({
                chunkIndex,
                totalChunks: ranges.length,
                progress: Math.round((chunkIndex / ranges.length) * 100),
            });
        }

        return {
            segments: acceptedSegments.map((segment, index) => ({ ...segment, id: index })),
            fullText: fullTextParts.join(" "),
            language: undefined,
            duration: audioBuffer.duration,
            provider: config.provider,
        };
    }

    /**
     * Get the provider info for display purposes
     */
    public getProviderInfo(provider: TranscriptionProvider) {
        return TRANSCRIPTION_PROVIDERS[provider];
    }

    /**
     * Get the API key for a transcription provider from localStorage
     */
    public getApiKeyForProvider(provider: TranscriptionProvider): string {
        switch (provider) {
            case "openai":
                return localStorage.getItem("openai_api_key") || "";
            case "groq":
                return localStorage.getItem("groq_api_key") || "";
            case "gemini":
                return localStorage.getItem("gemini_api_key") || "";
            case "local-whisper":
                return ""; // No API key required
            default:
                return "";
        }
    }

    /**
     * Get the currently preferred transcription provider from localStorage
     */
    public getPreferredProvider(): TranscriptionProvider {
        const saved = localStorage.getItem("preferred_transcription_provider");
        if (saved && (saved === "openai" || saved === "groq" || saved === "gemini" || saved === "local-whisper")) {
            return saved as TranscriptionProvider;
        }
        return "openai";
    }

    // ─── OpenAI Whisper ────────────────────────────────────────────

    private async transcribeWithOpenAI(
        config: TranscriptionConfig,
        audioBlob: Blob,
        options: TranscriptionRequestOptions
    ): Promise<TranscriptionResult> {
        const openai = new OpenAI({
            apiKey: config.apiKey,
            dangerouslyAllowBrowser: true,
        });

        const audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });

        let response;
        try {
            // Try with advanced parameters — word + segment timestamps
            response = await openai.audio.transcriptions.create({
                file: audioFile,
                model: "whisper-1",
                response_format: "verbose_json",
                timestamp_granularities: ["word", "segment"],
                prompt:
                    "Please transcribe this audio with proper sentence breaks and punctuation. Break long sentences into shorter, more natural segments.",
                temperature: 0.0,
            }, options.signal ? { signal: options.signal } : undefined);
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw error;
            }

            // Fallback to basic parameters
            response = await openai.audio.transcriptions.create({
                file: audioFile,
                model: "whisper-1",
                response_format: "verbose_json",
                temperature: 0.0,
            }, options.signal ? { signal: options.signal } : undefined);
        }

        const whisperResponse = response as unknown as WhisperVerboseResponse;
        return this.parseWhisperResponse(whisperResponse, "openai");
    }

    // ─── Groq Whisper ──────────────────────────────────────────────

    private async transcribeWithGroq(
        config: TranscriptionConfig,
        audioBlob: Blob,
        options: TranscriptionRequestOptions
    ): Promise<TranscriptionResult> {
        const formData = new FormData();
        formData.append("file", new File([audioBlob], "audio.wav", { type: "audio/wav" }));
        formData.append("model", TRANSCRIPTION_PROVIDERS.groq.model);
        formData.append("response_format", "verbose_json");
        formData.append("temperature", "0");
        formData.append("timestamp_granularities[]", "word");
        formData.append("timestamp_granularities[]", "segment");
        const language = normalizeWhisperLanguageCode(config.language);
        if (language) {
            formData.append("language", language);
        }

        const response = await fetch(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: formData,
                signal: options.signal,
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Groq API error: ${response.status} - ${errorText}`);
        }

        const whisperResponse: WhisperVerboseResponse = await response.json();
        return this.parseWhisperResponse(whisperResponse, "groq");
    }

    // ─── Google Gemini ─────────────────────────────────────────────

    private async transcribeWithGemini(
        config: TranscriptionConfig,
        audioBlob: Blob,
        options: TranscriptionRequestOptions
    ): Promise<TranscriptionResult> {
        // Convert audio to base64
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64Audio = btoa(binary);

        const mimeType = audioBlob.type || "audio/wav";
        const model = TRANSCRIPTION_PROVIDERS.gemini.model;

        const languageInstruction = config.language
            ? `Transcribe in ${config.language} language.`
            : "Detect the language automatically.";

        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Audio,
                            },
                        },
                        {
                            text: `Transcribe this audio with precise timestamps. ${languageInstruction}

Instructions:
1. Listen to the ENTIRE audio from start to finish
2. For EACH phrase or short sentence, note the EXACT second (with decimals) when the speaker starts and stops speaking
3. Timestamps are in SECONDS (not MM:SS). For example, 1 minute 30 seconds = 90.0, NOT 1:30
4. Be precise to at least one decimal place (e.g., 3.2, not 3)
5. Each segment should contain one short sentence or natural phrase (roughly 5-15 words)
6. The "end" of one segment must equal the "start" of the next segment — no gaps allowed
7. The first segment must start at 0.0 or when speech first begins
8. Include ALL spoken content — do not skip any words

IMPORTANT: All timestamps must be in total seconds as decimal numbers. 
Example: 2 minutes and 15.5 seconds = 135.5 (NOT 2:15.5, NOT 135, NOT "2m15s")`,
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.0,
                maxOutputTokens: 65536,
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "The full transcript text"
                        },
                        language: {
                            type: "string",
                            description: "Detected language code (e.g., en, ja, es, ko)"
                        },
                        segments: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    start: {
                                        type: "number",
                                        description: "Start time in seconds when this segment begins being spoken"
                                    },
                                    end: {
                                        type: "number",
                                        description: "End time in seconds when this segment finishes being spoken"
                                    },
                                    text: {
                                        type: "string",
                                        description: "The transcribed text for this segment"
                                    }
                                },
                                required: ["start", "end", "text"]
                            },
                            description: "Array of timed transcript segments"
                        }
                    },
                    required: ["text", "language", "segments"]
                },
            },
        };

        const apiKey = config.apiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: options.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        return this.parseGeminiResponse(content);
    }

    // ─── Local Whisper (faster-whisper-server) ─────────────────────

    private async transcribeWithLocalWhisper(
        config: TranscriptionConfig,
        audioBlob: Blob,
        options: TranscriptionRequestOptions
    ): Promise<TranscriptionResult> {
        const baseURL =
            localStorage.getItem("local_whisper_url") || "http://localhost:8000";
        const model =
            localStorage.getItem("local_whisper_model") ||
            "Systran/faster-whisper-large-v3";

        const formData = new FormData();
        formData.append("file", new File([audioBlob], "audio.wav", { type: "audio/wav" }));
        formData.append("model", model);
        formData.append("response_format", "verbose_json");
        formData.append("temperature", "0");
        const language = normalizeWhisperLanguageCode(config.language);
        if (language) {
            formData.append("language", language);
        }

        const response = await fetch(`${baseURL}/v1/audio/transcriptions`, {
            method: "POST",
            body: formData,
            signal: options.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Local Whisper error: ${response.status} - ${errorText}`);
        }

        const whisperResponse: WhisperVerboseResponse = await response.json();
        return this.parseWhisperResponse(whisperResponse, "local-whisper");
    }

    private async decodeAudioBlob(audioBlob: Blob): Promise<AudioBuffer> {
        const AudioContextClass =
            window.AudioContext ||
            (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;

        if (!AudioContextClass) {
            throw new Error("Web Audio API is not supported in this browser");
        }

        const audioContext = new AudioContextClass();
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
        } finally {
            void audioContext.close();
        }
    }

    private encodeAudioBufferRange(
        audioBuffer: AudioBuffer,
        startSeconds: number,
        endSeconds: number
    ): Blob {
        const startFrame = Math.max(0, Math.floor(startSeconds * audioBuffer.sampleRate));
        const endFrame = Math.min(
            audioBuffer.length,
            Math.ceil(endSeconds * audioBuffer.sampleRate)
        );
        const frameCount = endFrame - startFrame;

        if (frameCount <= 0) {
            throw new Error("Invalid transcription chunk range");
        }

        const samples = new Float32Array(frameCount);

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            for (let index = 0; index < frameCount; index++) {
                samples[index] += channelData[startFrame + index] / audioBuffer.numberOfChannels;
            }
        }

        return encodeWAV(samples, audioBuffer.sampleRate);
    }

    private throwIfAborted(signal?: AbortSignal) {
        if (!signal?.aborted) {
            return;
        }

        throw new DOMException("Transcription cancelled", "AbortError");
    }

    // ─── Response Parsers ──────────────────────────────────────────

    private parseWhisperResponse(
        response: WhisperVerboseResponse,
        provider: TranscriptionProvider
    ): TranscriptionResult {
        if (!response.segments || response.segments.length === 0) {
            // Fallback: single segment with full text
            return {
                segments: [
                    {
                        id: 0,
                        text: response.text,
                        start: 0,
                        end: response.duration || 0,
                        confidence: 0.9,
                    },
                ],
                fullText: response.text,
                language: response.language,
                duration: response.duration,
                provider,
                // Include words if available even in fallback
                words: response.words ?? undefined,
            };
        }

        const segments: TranscriptionSegment[] = response.segments.map(
            (seg, index) => ({
                id: index,
                text: seg.text.trim(),
                start: seg.start,
                end: seg.end,
                confidence: Math.exp(seg.avg_logprob),
            })
        );

        return {
            segments,
            fullText: response.text,
            language: response.language,
            duration: response.duration,
            provider,
            words: response.words ?? undefined,
        };
    }

    /**
     * Attempt to repair truncated JSON by closing open strings, arrays, and objects.
     * This handles cases where the Gemini response is cut off due to token limits.
     */
    private repairTruncatedJson(jsonStr: string): string | null {
        let str = jsonStr.trim();

        // Track whether we're inside a string
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            if (char === "\\") {
                escapeNext = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
            }
        }

        // If we're still in a string, close it properly
        if (inString) {
            // If the last character is an escape backslash, escape it
            if (str.endsWith("\\")) {
                str += "\\";
            }
            str += '"';
        }

        // Now track structural brackets/braces, ignoring those inside strings
        const stack: string[] = [];
        inString = false;
        escapeNext = false;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            if (char === "\\") {
                escapeNext = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;

            if (char === "{" || char === "[") {
                stack.push(char === "{" ? "}" : "]");
            } else if (char === "}" || char === "]") {
                if (stack.length > 0 && stack[stack.length - 1] === char) {
                    stack.pop();
                }
            }
        }

        // Close all open structures in reverse order
        const closing = stack.reverse().join("");
        const repaired = str + closing;

        try {
            JSON.parse(repaired);
            return repaired;
        } catch {
            return null;
        }
    }

    private parseGeminiResponse(content: string): TranscriptionResult {
        // Try to extract JSON from the response (handle possible markdown wrapping)
        let jsonStr = content.trim();

        // Strip BOM and other zero-width characters that break JSON.parse
        jsonStr = jsonStr.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "");

        // Handle markdown code blocks
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        // If direct parse fails, try to extract the outermost JSON object
        let parsed: {
            text?: string;
            language?: string;
            segments?: Array<{ start: number; end: number; text: string }>;
        } | null = null;

        try {
            parsed = JSON.parse(jsonStr);
        } catch (parseError) {
            console.warn("Gemini transcription: direct JSON.parse failed, trying regex extraction", parseError);

            // Attempt to find the outermost JSON object by matching first { to last }
            const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                try {
                    parsed = JSON.parse(objectMatch[0]);
                } catch (e) {
                    console.warn("Gemini transcription: regex JSON extraction also failed", e);
                }
            }

            // If regex extraction also failed, try to repair truncated JSON
            if (!parsed) {
                const repaired = this.repairTruncatedJson(jsonStr);
                if (repaired) {
                    try {
                        parsed = JSON.parse(repaired);
                        console.warn("Gemini transcription: successfully repaired truncated JSON");
                    } catch (e) {
                        console.warn("Gemini transcription: repaired JSON still failed to parse", e);
                    }
                }
            }
        }

        if (parsed) {
            let segments: TranscriptionSegment[] = (parsed.segments || []).map(
                (seg: { start: number; end: number; text: string }, index: number) => ({
                    id: index,
                    text: seg.text.trim(),
                    start: typeof seg.start === "number" && !isNaN(seg.start) ? Math.max(0, seg.start) : 0,
                    end: typeof seg.end === "number" && !isNaN(seg.end) ? Math.max(0, seg.end) : 0,
                    confidence: 0.85,
                })
            );

            // Sort segments by start time (Gemini occasionally returns out-of-order)
            segments.sort((a, b) => a.start - b.start);

            // Detect and fix the known Gemini "100-second minute" bug:
            // Some models output 100 where they mean 60, e.g., 130.0 instead of 90.0
            // Heuristic: if the last segment ends at > 1.5x the expected duration relative
            // to the number of segments and typical speech pace, timestamps may be scaled
            if (segments.length > 2) {
                const lastEnd = segments[segments.length - 1].end;
                const firstStart = segments[0].start;
                const totalDuration = lastEnd - firstStart;

                // Check for the pattern: gaps that are suspiciously large multiples
                // If the average segment is > 30 seconds, something is likely wrong
                const avgSegDuration = totalDuration / segments.length;

                if (avgSegDuration > 30 && segments.length > 3) {
                    // Likely a scaling issue — compress timestamps
                    // Estimate: typical speech has ~5-10 seconds per segment
                    const targetAvg = 7; // seconds per segment
                    const scale = targetAvg / avgSegDuration;

                    console.warn(`Gemini timestamp scaling detected: avg segment ${avgSegDuration.toFixed(1)}s, applying scale ${scale.toFixed(2)}`);

                    segments = segments.map((seg, i) => ({
                        ...seg,
                        id: i,
                        start: (seg.start - firstStart) * scale + firstStart,
                        end: (seg.end - firstStart) * scale + firstStart,
                    }));
                }
            }

            // Ensure each segment has a valid duration (end > start)
            segments = segments.map((seg) => {
                if (seg.end <= seg.start) {
                    // Give it a minimum duration based on text length (~150ms per word)
                    const wordCount = seg.text.split(/\s+/).length;
                    const estimatedDuration = Math.max(0.5, wordCount * 0.15);
                    return { ...seg, end: seg.start + estimatedDuration };
                }
                return seg;
            });

            // Re-assign IDs after all transforms
            segments = segments.map((seg, index) => ({ ...seg, id: index }));

            return {
                segments,
                fullText: parsed.text || segments.map((s) => s.text).join(" "),
                language: parsed.language,
                duration:
                    segments.length > 0 ? segments[segments.length - 1].end : undefined,
                provider: "gemini",
            };
        }

        // Fallback: treat the entire response as plain text
        console.warn("Gemini transcription: failed to parse structured response, using plain text");
        return {
            segments: [
                {
                    id: 0,
                    text: content,
                    start: 0,
                    end: 0,
                    confidence: 0.7,
                },
            ],
            fullText: content,
            provider: "gemini",
        };
    }
}

// Export singleton
export const transcriptionService = TranscriptionService.getInstance();
