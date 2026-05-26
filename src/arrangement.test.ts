import { describe, expect, it } from "vitest";
import { getCircleChord } from "./circleData";
import type { CompositionStep } from "./composition";
import {
  assignChordToSelectedOrNextEmpty,
  buildArrangementPlaybackEvents,
  deserializeArrangementState,
  generateHarmonyGrid,
  revoiceHarmonySlots,
  slotsFromLegacyComposition
} from "./arrangement";
import type { MelodyNote } from "./melody";
import { DEFAULT_PLAYBACK_SETTINGS } from "./playbackSettings";

const melodyNotes: MelodyNote[] = [
  {
    id: "note",
    midi: 60,
    startBeat: 0,
    durationBeats: 4,
    velocity: 0.8,
    createdAt: 1
  }
];

describe("arrangement harmony grid", () => {
  it("generates 1, 2, and 4 beat harmony grids from melody length", () => {
    expect(generateHarmonyGrid(melodyNotes, [], 1)).toHaveLength(4);
    expect(generateHarmonyGrid(melodyNotes, [], 2)).toHaveLength(2);
    expect(generateHarmonyGrid(melodyNotes, [], 4)).toHaveLength(1);
  });

  it("assigns a chord to the selected slot and generates a voicing", () => {
    const chord = getCircleChord(0, "major");
    const grid = generateHarmonyGrid(melodyNotes, [], 2);
    const assigned = assignChordToSelectedOrNextEmpty(grid, grid[1].id, chord, DEFAULT_PLAYBACK_SETTINGS, 2);

    expect(assigned.selectedSlotId).toBe(grid[1].id);
    expect(assigned.slots[1].chordId).toBe(chord.id);
    expect(assigned.slots[1].voicingMidi).toHaveLength(4);
  });

  it("falls back to the first empty slot when no slot is selected", () => {
    const chord = getCircleChord(7, "major");
    const grid = generateHarmonyGrid(melodyNotes, [], 2);
    const assigned = assignChordToSelectedOrNextEmpty(grid, null, chord, DEFAULT_PLAYBACK_SETTINGS, 2);

    expect(assigned.selectedSlotId).toBe(grid[0].id);
    expect(assigned.slots[0].chordId).toBe(chord.id);
  });

  it("revoices non-empty slots and ignores empty slots", () => {
    const chord = getCircleChord(0, "major");
    const grid = generateHarmonyGrid(melodyNotes, [], 2);
    const revoiced = revoiceHarmonySlots([{ ...grid[0], chordId: chord.id }, grid[1]], DEFAULT_PLAYBACK_SETTINGS);

    expect(revoiced[0].voicingMidi).toHaveLength(4);
    expect(revoiced[1].voicingMidi).toBeNull();
  });

  it("builds synchronized melody and harmony playback events", () => {
    const chord = getCircleChord(0, "major");
    const grid = assignChordToSelectedOrNextEmpty(
      generateHarmonyGrid(melodyNotes, [], 2),
      null,
      chord,
      DEFAULT_PLAYBACK_SETTINGS,
      2
    ).slots;
    const events = buildArrangementPlaybackEvents(melodyNotes, grid);

    expect(events).toEqual([
      expect.objectContaining({ type: "melody", startBeat: 0, durationBeats: 4 }),
      expect.objectContaining({ type: "harmony", startBeat: 0, durationBeats: 2 })
    ]);
  });

  it("deserializes arrangement slots", () => {
    const chord = getCircleChord(0, "major");
    const raw = JSON.stringify({
      gridBeats: 2,
      harmonySlots: [
        {
          id: "slot",
          startBeat: 0,
          durationBeats: 2,
          chordId: chord.id,
          voicingMidi: [48, 55, 64, 72]
        }
      ]
    });
    const state = deserializeArrangementState(raw);

    expect(state?.gridBeats).toBe(2);
    expect(state?.harmonySlots[0].chordId).toBe(chord.id);
  });

  it("migrates legacy composition steps into harmony slots", () => {
    const chord = getCircleChord(0, "major");
    const legacy: CompositionStep = {
      id: "legacy",
      chordId: chord.id,
      durationBeats: 2,
      voicingMidi: [48, 55, 64, 72],
      createdAt: 1
    };
    const slots = slotsFromLegacyComposition([legacy], 2);

    expect(slots).toEqual([
      expect.objectContaining({
        startBeat: 0,
        durationBeats: 2,
        chordId: chord.id,
        voicingMidi: [48, 55, 64, 72]
      })
    ]);
  });
});
