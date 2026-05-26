import { describe, expect, it } from "vitest";
import { buildChordPatternEvents } from "./audio";
import type { HarmonySlot, TimeSignature } from "./arrangement";
import { DEFAULT_PLAYBACK_SETTINGS, type ChordPattern, type PlaybackSettings } from "./playbackSettings";

const voicing = [48, 55, 64, 72] as const;

function settings(chordPattern: ChordPattern): PlaybackSettings {
  return { ...DEFAULT_PLAYBACK_SETTINGS, chordPattern };
}

function slot(durationBeats: number): HarmonySlot {
  return {
    id: "slot",
    startBeat: 0,
    durationBeats,
    chordId: "chord",
    voicingMidi: [...voicing] as [number, number, number, number]
  };
}

function expectEventsInsideSlot(chordPattern: ChordPattern, timeSignature: TimeSignature, durationBeats: number) {
  const targetSlot = slot(durationBeats);
  const events = buildChordPatternEvents(targetSlot, settings(chordPattern), timeSignature);
  const slotEnd = targetSlot.startBeat + targetSlot.durationBeats;

  expect(events.length).toBeGreaterThan(0);
  expect(events.every((event) => event.startBeat >= targetSlot.startBeat)).toBe(true);
  expect(events.every((event) => event.startBeat + event.durationBeats <= slotEnd)).toBe(true);
}

describe("chord pattern events", () => {
  it("keeps pulse, broken, and arp events inside the harmony slot", () => {
    expectEventsInsideSlot("pulse", "4/4", 4);
    expectEventsInsideSlot("broken", "4/4", 4);
    expectEventsInsideSlot("arp", "4/4", 4);
    expectEventsInsideSlot("pulse", "3/4", 3);
    expectEventsInsideSlot("broken", "3/4", 3);
    expectEventsInsideSlot("arp", "3/4", 3);
  });

  it("does not introduce pitches outside the saved voicing", () => {
    for (const chordPattern of ["held", "pulse", "broken", "arp"] as const) {
      const events = buildChordPatternEvents(slot(4), settings(chordPattern), "4/4");
      const eventPitches = new Set(events.map((event) => event.midi));

      expect([...eventPitches].every((midi) => voicing.includes(midi))).toBe(true);
      expect(eventPitches).toEqual(new Set(voicing));
    }
  });

  it("uses the first beat of each bar as a stronger pulse accent", () => {
    const events = buildChordPatternEvents(slot(3), settings("pulse"), "3/4");
    const firstBeatVelocity = events.find((event) => event.startBeat === 0)?.velocity ?? 0;
    const secondBeatVelocity = events.find((event) => event.startBeat === 1)?.velocity ?? 0;

    expect(firstBeatVelocity).toBeGreaterThan(secondBeatVelocity);
  });
});
