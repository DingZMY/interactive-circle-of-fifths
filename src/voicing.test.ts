import { describe, expect, it } from "vitest";
import { getCircleChord } from "./circleData";
import { DEFAULT_PLAYBACK_SETTINGS, type PlaybackSettings } from "./playbackSettings";
import {
  buildDefaultVoicing,
  buildSmartVoicing,
  totalVoiceMovement,
  voicingSpan
} from "./voicing";

function settings(partial: Partial<PlaybackSettings>): PlaybackSettings {
  return { ...DEFAULT_PLAYBACK_SETTINGS, ...partial };
}

describe("smart voicing", () => {
  it("builds four-note voicings that span more than one octave", () => {
    const voicing = buildSmartVoicing(getCircleChord(0, "major"), DEFAULT_PLAYBACK_SETTINGS);

    expect(voicing).toHaveLength(4);
    expect(voicingSpan(voicing)).toBeGreaterThan(12);
  });

  it("moves the voicing register up and down", () => {
    const chord = getCircleChord(0, "major");
    const low = buildSmartVoicing(chord, settings({ register: "low" }));
    const high = buildSmartVoicing(chord, settings({ register: "high" }));

    expect(high[0]).toBeGreaterThan(low[0]);
  });

  it("changes the span when spread changes", () => {
    const chord = getCircleChord(0, "major");
    const compact = buildSmartVoicing(chord, settings({ spread: "compact" }));
    const wide = buildSmartVoicing(chord, settings({ spread: "wide" }));

    expect(voicingSpan(wide)).toBeGreaterThan(voicingSpan(compact));
  });

  it("prefers smoother movement when a previous voicing is available", () => {
    const cMajor = getCircleChord(0, "major");
    const gMajor = getCircleChord(7, "major");
    const previous = buildSmartVoicing(cMajor, DEFAULT_PLAYBACK_SETTINGS);
    const defaultNext = buildDefaultVoicing(gMajor, DEFAULT_PLAYBACK_SETTINGS);
    const smoothNext = buildSmartVoicing(gMajor, DEFAULT_PLAYBACK_SETTINGS, previous);

    expect(totalVoiceMovement(smoothNext, previous)).toBeLessThan(totalVoiceMovement(defaultNext, previous));
  });
});
