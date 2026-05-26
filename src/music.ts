export type ChordQuality = "major" | "minor" | "diminished";
export type NoteLetter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export interface SpelledNote {
  pitchClass: number;
  label: string;
  letter: NoteLetter;
  accidental: number;
}

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

export const NATURAL_PITCH_CLASSES: Record<NoteLetter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

const ACCIDENTAL_LABELS: Record<number, string> = {
  "-2": "bb",
  "-1": "b",
  0: "",
  1: "#",
  2: "x"
};

export const QUALITY_INTERVALS: Record<ChordQuality, [number, number, number]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6]
};

export function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

export function parseNoteLabel(label: string): SpelledNote {
  const match = label.match(/^([A-G])([#b]{0,2}|x)?$/);

  if (!match) {
    throw new Error(`Invalid note label: ${label}`);
  }

  const letter = match[1] as NoteLetter;
  const accidentalText = match[2] ?? "";
  const accidental =
    accidentalText === "x"
      ? 2
      : accidentalText.split("").reduce((sum, symbol) => sum + (symbol === "#" ? 1 : -1), 0);

  return {
    pitchClass: mod12(NATURAL_PITCH_CLASSES[letter] + accidental),
    label,
    letter,
    accidental
  };
}

function accidentalForPitch(letter: NoteLetter, pitchClass: number): number {
  let accidental = mod12(pitchClass - NATURAL_PITCH_CLASSES[letter]);

  if (accidental > 6) {
    accidental -= 12;
  }

  return accidental;
}

export function spellPitch(letter: NoteLetter, pitchClass: number): SpelledNote {
  const accidental = accidentalForPitch(letter, pitchClass);

  return {
    pitchClass: mod12(pitchClass),
    letter,
    accidental,
    label: `${letter}${ACCIDENTAL_LABELS[accidental] ?? ""}`
  };
}

export function rotateLetter(letter: NoteLetter, offset: number): NoteLetter {
  const index = LETTERS.indexOf(letter);

  return LETTERS[modIndex(index + offset, LETTERS.length)];
}

function modIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export function spellScale(tonicLabel: string, intervals: number[]): SpelledNote[] {
  const tonic = parseNoteLabel(tonicLabel);

  return intervals.map((interval, index) =>
    spellPitch(rotateLetter(tonic.letter, index), tonic.pitchClass + interval)
  );
}

export function getChordTones(rootLabel: string, quality: ChordQuality): SpelledNote[] {
  const root = parseNoteLabel(rootLabel);
  const intervals = QUALITY_INTERVALS[quality];
  const letterOffsets = [0, 2, 4];

  return intervals.map((interval, index) =>
    spellPitch(rotateLetter(root.letter, letterOffsets[index]), root.pitchClass + interval)
  );
}

export function qualityLabel(quality: ChordQuality): string {
  if (quality === "major") {
    return "Major";
  }

  if (quality === "minor") {
    return "Minor";
  }

  return "Diminished";
}
