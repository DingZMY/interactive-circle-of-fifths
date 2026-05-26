import { describe, expect, it } from "vitest";
import {
  createMelodyRecorderState,
  finishMelodyRecording,
  handleMelodyKeyDown,
  handleMelodyKeyUp,
  midiForKeyboardKey,
  quantizeRawMelodyNotes,
  toggleGridMelodyNote
} from "./melody";

describe("melody keyboard recording", () => {
  it("maps computer keys to chromatic MIDI notes", () => {
    expect(midiForKeyboardKey("a", 0)).toBe(60);
    expect(midiForKeyboardKey("w", 0)).toBe(61);
    expect(midiForKeyboardKey("k", 0)).toBe(72);
    expect(midiForKeyboardKey("a", 1)).toBe(72);
  });

  it("creates a single note from keydown and keyup", () => {
    const started = createMelodyRecorderState(0, 0);
    const down = handleMelodyKeyDown(started, "a", 0);
    const up = handleMelodyKeyUp(down.state, "a", 500);
    const notes = finishMelodyRecording(up, 500, 120);

    expect(down.previewMidi).toBe(60);
    expect(notes).toEqual([
      expect.objectContaining({
        midi: 60,
        startBeat: 0,
        durationBeats: 1
      })
    ]);
  });

  it("uses the latest held key as the active monophonic note", () => {
    const started = createMelodyRecorderState(0, 0);
    const first = handleMelodyKeyDown(started, "a", 0);
    const second = handleMelodyKeyDown(first.state, "s", 250);
    const releaseSecond = handleMelodyKeyUp(second.state, "s", 500);
    const releaseFirst = handleMelodyKeyUp(releaseSecond, "a", 750);
    const notes = finishMelodyRecording(releaseFirst, 750, 120);

    expect(notes.map((note) => note.midi)).toEqual([60, 62, 60]);
    expect(notes.every((note) => note.durationBeats >= 0.5)).toBe(true);
  });

  it("quantizes raw timing to eighth-note beats", () => {
    const notes = quantizeRawMelodyNotes(
      [
        {
          id: "one",
          midi: 64,
          startMs: 120,
          durationMs: 130,
          velocity: 0.8,
          createdAt: 1
        }
      ],
      0,
      120
    );

    expect(notes[0].startBeat).toBe(0);
    expect(notes[0].durationBeats).toBe(0.5);
  });

  it("toggles grid notes by pitch and start cell", () => {
    const added = toggleGridMelodyNote([], 60, 1, 0.5, 10);
    const removed = toggleGridMelodyNote(added, 60, 1, 0.5, 20);

    expect(added).toEqual([
      expect.objectContaining({
        midi: 60,
        startBeat: 1,
        durationBeats: 0.5
      })
    ]);
    expect(removed).toEqual([]);
  });

  it("replaces overlapping notes on the same pitch", () => {
    const first = toggleGridMelodyNote([], 64, 0.5, 1, 10);
    const second = toggleGridMelodyNote(first, 64, 0, 1, 20);

    expect(second).toHaveLength(1);
    expect(second[0]).toEqual(
      expect.objectContaining({
        midi: 64,
        startBeat: 0,
        durationBeats: 1
      })
    );
  });
});
