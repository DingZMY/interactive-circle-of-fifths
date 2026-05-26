import { describe, expect, it } from "vitest";
import { DEFAULT_PLAYBACK_SETTINGS, sanitizePlaybackSettings } from "./playbackSettings";

describe("playback settings", () => {
  it("defaults old settings to the broken chord pattern", () => {
    const settings = sanitizePlaybackSettings({
      preset: "chamber-keys",
      tempoBpm: 88,
      register: "mid",
      spread: "open",
      motion: 0.38,
      reverbAmount: 0.34
    });

    expect(settings.chordPattern).toBe("broken");
  });

  it("falls back from invalid chord patterns", () => {
    const settings = sanitizePlaybackSettings({ ...DEFAULT_PLAYBACK_SETTINGS, chordPattern: "shuffle" });

    expect(settings.chordPattern).toBe(DEFAULT_PLAYBACK_SETTINGS.chordPattern);
  });
});
