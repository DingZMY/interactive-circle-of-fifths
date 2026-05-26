import { describe, expect, it } from "vitest";
import { getCircleChord } from "./circleData";
import type { CompositionStep } from "./composition";
import {
  assignChordToSelectedOrNextEmpty,
  beatsPerBar,
  buildArrangementPlaybackEvents,
  deserializeArrangementState,
  generateHarmonyGrid,
  gridDurationBeats,
  measureLineBeats,
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
  it("generates 1, 2, and bar-length harmony grids from melody length", () => {
    expect(generateHarmonyGrid(melodyNotes, [], 1)).toHaveLength(4);
    expect(generateHarmonyGrid(melodyNotes, [], 2)).toHaveLength(2);
    expect(generateHarmonyGrid(melodyNotes, [], "bar")).toHaveLength(1);
    expect(generateHarmonyGrid(melodyNotes, [], "bar", "3/4")).toHaveLength(2);
  });

  it("maps time signatures to bar lengths and measure lines", () => {
    expect(beatsPerBar("4/4")).toBe(4);
    expect(beatsPerBar("3/4")).toBe(3);
    expect(gridDurationBeats("bar", "4/4")).toBe(4);
    expect(gridDurationBeats("bar", "3/4")).toBe(3);
    expect(measureLineBeats(8, "4/4")).toEqual([0, 4, 8]);
    expect(measureLineBeats(6, "3/4")).toEqual([0, 3, 6]);
  });

  it("uses the active time signature when adding one bar of minimum space", () => {
    expect(generateHarmonyGrid([], [], "bar", "4/4", beatsPerBar("4/4")).at(-1)?.durationBeats).toBe(4);
    expect(generateHarmonyGrid([], [], "bar", "3/4", beatsPerBar("3/4")).at(-1)?.durationBeats).toBe(3);
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
    expect(state?.timeSignature).toBe("4/4");
    expect(state?.harmonySlots[0].chordId).toBe(chord.id);
  });

  it("deserializes time signatures and migrates old 4-beat grids to bar grids", () => {
    const chord = getCircleChord(0, "major");
    const raw = JSON.stringify({
      gridBeats: 4,
      timeSignature: "3/4",
      harmonySlots: [
        {
          id: "slot",
          startBeat: 0,
          durationBeats: 4,
          chordId: chord.id,
          voicingMidi: [48, 55, 64, 72]
        }
      ]
    });
    const state = deserializeArrangementState(raw);

    expect(state?.gridBeats).toBe("bar");
    expect(state?.timeSignature).toBe("3/4");
    expect(state?.harmonySlots[0].durationBeats).toBe(3);
  });

  it("preserves stored partial slots from current arrangement saves", () => {
    const chord = getCircleChord(0, "major");
    const raw = JSON.stringify({
      gridBeats: 2,
      timeSignature: "3/4",
      harmonySlots: [
        {
          id: "tail",
          startBeat: 8,
          durationBeats: 1,
          chordId: chord.id,
          voicingMidi: [48, 55, 64, 72]
        }
      ]
    });
    const state = deserializeArrangementState(raw);

    expect(state?.harmonySlots[0].startBeat).toBe(8);
    expect(state?.harmonySlots[0].durationBeats).toBe(1);
  });

  it("falls back to 4/4 for invalid or missing time signatures", () => {
    const state = deserializeArrangementState(JSON.stringify({ gridBeats: 2, timeSignature: "7/8", harmonySlots: [] }));

    expect(state?.timeSignature).toBe("4/4");
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
