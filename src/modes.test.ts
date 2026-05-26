import { describe, expect, it } from "vitest";
import { CIRCLE_CHORDS_BY_ID, chordId } from "./circleData";
import {
  MODES,
  allGeneratedChordsMatchCircle,
  allModePlans,
  buildModePlan
} from "./modes";
import { getChordTones } from "./music";

describe("mode plans", () => {
  it("generates 84 tonic and mode plans", () => {
    expect(allModePlans()).toHaveLength(84);
    expect(MODES).toHaveLength(7);
  });

  it("generates seven triads for every plan and matches the circle", () => {
    expect(allGeneratedChordsMatchCircle()).toBe(true);

    for (const plan of allModePlans()) {
      expect(plan.chords).toHaveLength(7);
      for (const chord of plan.chords) {
        expect(CIRCLE_CHORDS_BY_ID.has(chordId(chord.rootPitchClass, chord.quality))).toBe(true);
      }
    }
  });

  it("generates C Ionian triads", () => {
    expect(buildModePlan("C", "Ionian").chords.map((chord) => chord.label)).toEqual([
      "C",
      "Dm",
      "Em",
      "F",
      "G",
      "Am",
      "B°"
    ]);
  });

  it("generates D Dorian triads", () => {
    expect(buildModePlan("D", "Dorian").chords.map((chord) => chord.label)).toEqual([
      "Dm",
      "Em",
      "F",
      "G",
      "Am",
      "B°",
      "C"
    ]);
  });

  it("generates F Lydian triads", () => {
    expect(buildModePlan("F", "Lydian").chords.map((chord) => chord.label)).toEqual([
      "F",
      "G",
      "Am",
      "B°",
      "C",
      "Dm",
      "Em"
    ]);
  });

  it("generates B Locrian triads", () => {
    expect(buildModePlan("B", "Locrian").chords.map((chord) => chord.label)).toEqual([
      "B°",
      "C",
      "Dm",
      "Em",
      "F",
      "G",
      "Am"
    ]);
  });

  it("returns spelled chord tones for clicked chord details", () => {
    expect(getChordTones("C", "major").map((tone) => tone.label)).toEqual(["C", "E", "G"]);
    expect(getChordTones("D", "minor").map((tone) => tone.label)).toEqual(["D", "F", "A"]);
    expect(getChordTones("B", "diminished").map((tone) => tone.label)).toEqual(["B", "D", "F"]);
  });
});
