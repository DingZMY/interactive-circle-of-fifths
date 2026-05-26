import { describe, expect, it } from "vitest";
import {
  CIRCLE_CHORDS,
  CIRCLE_CHORDS_BY_ID,
  FIFTHS,
  chordId
} from "./circleData";

describe("circle data", () => {
  it("contains 36 interactive chord buttons", () => {
    expect(CIRCLE_CHORDS).toHaveLength(36);
    expect(CIRCLE_CHORDS_BY_ID.size).toBe(36);
  });

  it("uses the image's fifth order for tonic labels", () => {
    expect(FIFTHS.map((tonic) => tonic.label)).toEqual([
      "C",
      "G",
      "D",
      "A",
      "E",
      "B",
      "Gb",
      "Db",
      "Ab",
      "Eb",
      "Bb",
      "F"
    ]);
  });

  it("includes major, relative minor, and leading-tone diminished chords for C sector", () => {
    expect(CIRCLE_CHORDS_BY_ID.get(chordId(0, "major"))?.label).toBe("C");
    expect(CIRCLE_CHORDS_BY_ID.get(chordId(9, "minor"))?.label).toBe("Am");
    expect(CIRCLE_CHORDS_BY_ID.get(chordId(11, "diminished"))?.label).toBe("B°");
  });
});
