import { type ChordQuality, QUALITY_INTERVALS, mod12, parseNoteLabel } from "./music";

export type CircleLayer = "major" | "minor" | "diminished";

export interface FifthTonic {
  label: string;
  pitchClass: number;
}

export interface CircleChord {
  id: string;
  label: string;
  rootLabel: string;
  rootPitchClass: number;
  quality: ChordQuality;
  layer: CircleLayer;
  sectorIndex: number;
  angle: number;
  radius: number;
  color: string;
  tones: number[];
}

export const FIFTHS: FifthTonic[] = [
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
].map((label) => ({
  label,
  pitchClass: parseNoteLabel(label).pitchClass
}));

export const MAJOR_LABEL_BY_PC = new Map(FIFTHS.map((tonic) => [tonic.pitchClass, tonic.label]));

export const MINOR_LABEL_BY_PC = new Map<number, string>([
  [9, "A"],
  [4, "E"],
  [11, "B"],
  [6, "F#"],
  [1, "C#"],
  [8, "G#"],
  [3, "Eb"],
  [10, "Bb"],
  [5, "F"],
  [0, "C"],
  [7, "G"],
  [2, "D"]
]);

export const DIMINISHED_LABEL_BY_PC = new Map<number, string>([
  [11, "B"],
  [6, "F#"],
  [1, "C#"],
  [8, "G#"],
  [3, "D#"],
  [10, "A#"],
  [5, "F"],
  [0, "C"],
  [7, "G"],
  [2, "D"],
  [9, "A"],
  [4, "E"]
]);

export const COLOR_BY_PC = new Map<number, string>([
  [0, "#d72b55"],
  [7, "#f05a2a"],
  [2, "#f28b22"],
  [9, "#f7bd2f"],
  [4, "#ffe12b"],
  [11, "#a9cf42"],
  [6, "#3faf55"],
  [1, "#16a89f"],
  [8, "#1399ce"],
  [3, "#376bb2"],
  [10, "#7b3d99"],
  [5, "#b42aa2"]
]);

export const CIRCLE_CENTER = 500;
export const CIRCLE_VIEWBOX_SIZE = 1000;
export const INNER_HOLE_RADIUS = 190;
export const MAJOR_RADIUS = 245;
export const MINOR_RADIUS = 335;
export const DIMINISHED_RADIUS = 430;
export const OUTER_RADIUS = 485;
export const MAJOR_RING_OUTER = 285;
export const MINOR_RING_OUTER = 380;

export function chordId(rootPitchClass: number, quality: ChordQuality): string {
  return `${mod12(rootPitchClass)}-${quality}`;
}

export function getDisplayRootLabel(rootPitchClass: number, quality: ChordQuality): string {
  if (quality === "major") {
    return MAJOR_LABEL_BY_PC.get(rootPitchClass) ?? String(rootPitchClass);
  }

  if (quality === "minor") {
    return MINOR_LABEL_BY_PC.get(rootPitchClass) ?? String(rootPitchClass);
  }

  return DIMINISHED_LABEL_BY_PC.get(rootPitchClass) ?? String(rootPitchClass);
}

function formatChordLabel(rootLabel: string, quality: ChordQuality): string {
  if (quality === "minor") {
    return `${rootLabel}m`;
  }

  if (quality === "diminished") {
    return `${rootLabel}°`;
  }

  return rootLabel;
}

function buildChord(
  sectorIndex: number,
  quality: ChordQuality,
  rootPitchClass: number,
  layer: CircleLayer,
  radius: number
): CircleChord {
  const rootLabel = getDisplayRootLabel(rootPitchClass, quality);
  const intervals = QUALITY_INTERVALS[quality];

  return {
    id: chordId(rootPitchClass, quality),
    label: formatChordLabel(rootLabel, quality),
    rootLabel,
    rootPitchClass,
    quality,
    layer,
    sectorIndex,
    angle: -90 + sectorIndex * 30,
    radius,
    color: COLOR_BY_PC.get(rootPitchClass) ?? "#ffffff",
    tones: intervals.map((interval) => mod12(rootPitchClass + interval))
  };
}

export function createCircleChords(): CircleChord[] {
  return FIFTHS.flatMap((tonic, sectorIndex) => [
    buildChord(sectorIndex, "major", tonic.pitchClass, "major", MAJOR_RADIUS),
    buildChord(sectorIndex, "minor", mod12(tonic.pitchClass - 3), "minor", MINOR_RADIUS),
    buildChord(sectorIndex, "diminished", mod12(tonic.pitchClass - 1), "diminished", DIMINISHED_RADIUS)
  ]);
}

export const CIRCLE_CHORDS = createCircleChords();
export const CIRCLE_CHORDS_BY_ID = new Map(CIRCLE_CHORDS.map((chord) => [chord.id, chord]));

export function getCircleChord(rootPitchClass: number, quality: ChordQuality): CircleChord {
  const chord = CIRCLE_CHORDS_BY_ID.get(chordId(rootPitchClass, quality));

  if (!chord) {
    throw new Error(`Circle chord not found: ${rootPitchClass} ${quality}`);
  }

  return chord;
}

export function polarToCartesian(radius: number, angleDegrees: number): { x: number; y: number } {
  const radians = (angleDegrees * Math.PI) / 180;

  return {
    x: CIRCLE_CENTER + radius * Math.cos(radians),
    y: CIRCLE_CENTER + radius * Math.sin(radians)
  };
}

export function textColorForBackground(hex: string): "#111" | "#fff" {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.58 ? "#111" : "#fff";
}
