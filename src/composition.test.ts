import { describe, expect, it } from "vitest";
import { getCircleChord } from "./circleData";
import {
  appendCompositionStep,
  clearComposition,
  deserializeCompositionSteps,
  moveCompositionStep,
  removeCompositionStep,
  timelineDurationSeconds
} from "./composition";
import { DEFAULT_PLAYBACK_SETTINGS } from "./playbackSettings";

describe("composition timeline", () => {
  it("appends, removes, moves, and clears steps", () => {
    const cMajor = getCircleChord(0, "major");
    const gMajor = getCircleChord(7, "major");
    const aMinor = getCircleChord(9, "minor");
    const first = appendCompositionStep([], cMajor, DEFAULT_PLAYBACK_SETTINGS, 1, "first");
    const second = appendCompositionStep(first, gMajor, DEFAULT_PLAYBACK_SETTINGS, 2, "second");
    const third = appendCompositionStep(second, aMinor, DEFAULT_PLAYBACK_SETTINGS, 3, "third");

    expect(third.map((step) => step.chordId)).toEqual([cMajor.id, gMajor.id, aMinor.id]);

    const moved = moveCompositionStep(third, "third", -1);
    expect(moved.map((step) => step.id)).toEqual(["first", "third", "second"]);

    const removed = removeCompositionStep(moved, "third");
    expect(removed.map((step) => step.id)).toEqual(["first", "second"]);
    expect(clearComposition()).toEqual([]);
  });

  it("ignores invalid chord ids during deserialization", () => {
    const cMajor = getCircleChord(0, "major");
    const raw = JSON.stringify([
      {
        id: "valid",
        chordId: cMajor.id,
        durationBeats: 2,
        voicingMidi: [48, 55, 64, 72],
        createdAt: 1
      },
      {
        id: "invalid",
        chordId: "not-a-chord",
        durationBeats: 2,
        voicingMidi: [48, 55, 64, 72],
        createdAt: 2
      }
    ]);

    const steps = deserializeCompositionSteps(raw, DEFAULT_PLAYBACK_SETTINGS);

    expect(steps).toHaveLength(1);
    expect(steps[0].chordId).toBe(cMajor.id);
  });

  it("derives playback duration from fixed two-beat steps and tempo", () => {
    const cMajor = getCircleChord(0, "major");
    const steps = appendCompositionStep([], cMajor, DEFAULT_PLAYBACK_SETTINGS, 1, "first");

    expect(timelineDurationSeconds(steps, 120)).toBe(1);
  });
});
