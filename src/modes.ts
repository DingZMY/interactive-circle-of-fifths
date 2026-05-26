import {
  FIFTHS,
  type CircleChord,
  CIRCLE_CHORDS_BY_ID,
  chordId,
  getCircleChord,
  getDisplayRootLabel
} from "./circleData";
import {
  type ChordQuality,
  type SpelledNote,
  getChordTones,
  mod12,
  spellScale
} from "./music";

export type ModeName =
  | "Ionian"
  | "Dorian"
  | "Phrygian"
  | "Lydian"
  | "Mixolydian"
  | "Aeolian"
  | "Locrian";

export interface ModeDefinition {
  name: ModeName;
  intervals: number[];
}

export interface ModeChord {
  degree: number;
  roman: string;
  rootPitchClass: number;
  quality: ChordQuality;
  label: string;
  rootLabel: string;
  tones: string[];
  circleChord: CircleChord;
}

export interface ModePlan {
  tonic: string;
  mode: ModeName;
  scale: SpelledNote[];
  chords: ModeChord[];
}

export const MODES: ModeDefinition[] = [
  { name: "Ionian", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: "Aeolian", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] }
];

const ROMAN_BASE = ["I", "II", "III", "IV", "V", "VI", "VII"];

export function getModeDefinition(mode: ModeName): ModeDefinition {
  const definition = MODES.find((candidate) => candidate.name === mode);

  if (!definition) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  return definition;
}

function triadQuality(root: number, third: number, fifth: number): ChordQuality {
  const thirdInterval = mod12(third - root);
  const fifthInterval = mod12(fifth - root);

  if (thirdInterval === 4 && fifthInterval === 7) {
    return "major";
  }

  if (thirdInterval === 3 && fifthInterval === 7) {
    return "minor";
  }

  if (thirdInterval === 3 && fifthInterval === 6) {
    return "diminished";
  }

  throw new Error(`Unsupported triad: ${root} ${third} ${fifth}`);
}

function romanNumeral(degree: number, quality: ChordQuality): string {
  const base = ROMAN_BASE[degree - 1];

  if (quality === "major") {
    return base;
  }

  if (quality === "minor") {
    return base.toLowerCase();
  }

  return `${base.toLowerCase()}°`;
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

export function buildModePlan(tonicLabel: string, mode: ModeName): ModePlan {
  const tonic = FIFTHS.find((candidate) => candidate.label === tonicLabel);

  if (!tonic) {
    throw new Error(`Unknown tonic: ${tonicLabel}`);
  }

  const definition = getModeDefinition(mode);
  const scale = spellScale(tonicLabel, definition.intervals);
  const pitchClasses = definition.intervals.map((interval) => mod12(tonic.pitchClass + interval));
  const chords = pitchClasses.map((rootPitchClass, index) => {
    const third = pitchClasses[(index + 2) % pitchClasses.length];
    const fifth = pitchClasses[(index + 4) % pitchClasses.length];
    const quality = triadQuality(rootPitchClass, third, fifth);
    const circleChord = getCircleChord(rootPitchClass, quality);
    const rootLabel = getDisplayRootLabel(rootPitchClass, quality);

    return {
      degree: index + 1,
      roman: romanNumeral(index + 1, quality),
      rootPitchClass,
      quality,
      rootLabel,
      label: formatChordLabel(rootLabel, quality),
      tones: getChordTones(rootLabel, quality).map((tone) => tone.label),
      circleChord
    };
  });

  return {
    tonic: tonicLabel,
    mode,
    scale,
    chords
  };
}

export function findModeMembership(plan: ModePlan, chord: CircleChord): ModeChord | undefined {
  return plan.chords.find((modeChord) => modeChord.circleChord.id === chord.id);
}

export function allModePlans(): ModePlan[] {
  return FIFTHS.flatMap((tonic) => MODES.map((mode) => buildModePlan(tonic.label, mode.name)));
}

export function allGeneratedChordsMatchCircle(): boolean {
  return allModePlans().every((plan) =>
    plan.chords.every((chord) => CIRCLE_CHORDS_BY_ID.has(chordId(chord.rootPitchClass, chord.quality)))
  );
}
