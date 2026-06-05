import test from "node:test";
import assert from "node:assert/strict";

import { parseProbeAudioMetadata } from "../electron/waveformProbe.ts";

test("parseProbeAudioMetadata returns null when ffprobe reports no audio streams", () => {
  const metadata = parseProbeAudioMetadata({
    format: { duration: "12.5" },
    streams: [
      {
        codec_type: "video",
        duration: "12.5",
      },
    ],
  });

  assert.equal(metadata, null);
});
