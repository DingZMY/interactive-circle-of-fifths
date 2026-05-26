import type { CircleChord } from "./circleData";
import { QUALITY_INTERVALS, mod12 } from "./music";
import type { PlaybackSettings, RegisterSetting, SpreadSetting } from "./playbackSettings";

export type Voicing = [number, number, number, number];

interface RegisterRange {
  min: number;
  max: number;
  center: number;
}

const REGISTER_RANGES: Record<RegisterSetting, RegisterRange> = {
  low: { min: 34, max: 70, center: 50 },
  mid: { min: 41, max: 82, center: 61 },
  high: { min: 48, max: 91, center: 72 }
};

const SPREAD_TARGETS: Record<SpreadSetting, number> = {
  compact: 16,
  open: 24,
  wide: 32
};

function midiForPitchClassInRange(pitchClass: number, min: number, max: number): number[] {
  const notes: number[] = [];

  for (let midi = min; midi <= max; midi += 1) {
    if (mod12(midi) === pitchClass) {
      notes.push(midi);
    }
  }

  return notes;
}

function uniqueSortedVoicing(notes: number[]): Voicing | null {
  const sorted = [...notes].sort((a, b) => a - b);
  const unique = new Set(sorted);

  if (unique.size !== 4) {
    return null;
  }

  return sorted as Voicing;
}

function mean(notes: number[]): number {
  return notes.reduce((sum, note) => sum + note, 0) / notes.length;
}

export function voicingSpan(voicing: Voicing): number {
  return voicing[voicing.length - 1] - voicing[0];
}

export function totalVoiceMovement(current: Voicing, previous: Voicing): number {
  return current.reduce((sum, note, index) => sum + Math.abs(note - previous[index]), 0);
}

export function generateVoicingCandidates(chord: CircleChord, settings: PlaybackSettings): Voicing[] {
  const range = REGISTER_RANGES[settings.register];
  const intervals = QUALITY_INTERVALS[chord.quality];
  const rootPitchClass = chord.rootPitchClass;
  const thirdPitchClass = mod12(rootPitchClass + intervals[1]);
  const fifthPitchClass = mod12(rootPitchClass + intervals[2]);
  const rootNotes = midiForPitchClassInRange(rootPitchClass, range.min, range.max);
  const thirdNotes = midiForPitchClassInRange(thirdPitchClass, range.min, range.max);
  const fifthNotes = midiForPitchClassInRange(fifthPitchClass, range.min, range.max);
  const candidates = new Map<string, Voicing>();

  for (let firstRootIndex = 0; firstRootIndex < rootNotes.length; firstRootIndex += 1) {
    for (let secondRootIndex = firstRootIndex + 1; secondRootIndex < rootNotes.length; secondRootIndex += 1) {
      for (const third of thirdNotes) {
        for (const fifth of fifthNotes) {
          const candidate = uniqueSortedVoicing([
            rootNotes[firstRootIndex],
            rootNotes[secondRootIndex],
            third,
            fifth
          ]);

          if (!candidate) {
            continue;
          }

          const span = voicingSpan(candidate);

          if (span <= 12 || span > 40) {
            continue;
          }

          candidates.set(candidate.join(","), candidate);
        }
      }
    }
  }

  return [...candidates.values()];
}

function voicingScore(candidate: Voicing, settings: PlaybackSettings, previousVoicing?: Voicing): number {
  const range = REGISTER_RANGES[settings.register];
  const targetSpread = SPREAD_TARGETS[settings.spread];
  const spacingPenalty = candidate
    .slice(1)
    .reduce((sum, note, index) => sum + Math.max(0, note - candidate[index] - 16), 0);
  const baseScore =
    Math.abs(voicingSpan(candidate) - targetSpread) * 2.4 +
    Math.abs(mean(candidate) - range.center) * 0.7 +
    spacingPenalty * 1.2;

  if (!previousVoicing) {
    return baseScore;
  }

  return baseScore + totalVoiceMovement(candidate, previousVoicing) * 1.45;
}

export function buildSmartVoicing(
  chord: CircleChord,
  settings: PlaybackSettings,
  previousVoicing?: Voicing
): Voicing {
  const candidates = generateVoicingCandidates(chord, settings);

  if (candidates.length === 0) {
    throw new Error(`No voicing candidates for ${chord.label}`);
  }

  return candidates
    .map((candidate) => ({
      candidate,
      score: voicingScore(candidate, settings, previousVoicing)
    }))
    .sort((a, b) => a.score - b.score)[0].candidate;
}

export function buildDefaultVoicing(chord: CircleChord, settings: PlaybackSettings): Voicing {
  return buildSmartVoicing(chord, settings);
}

export function buildTimelineVoicings(chords: CircleChord[], settings: PlaybackSettings): Voicing[] {
  const voicings: Voicing[] = [];

  for (const chord of chords) {
    voicings.push(buildSmartVoicing(chord, settings, voicings[voicings.length - 1]));
  }

  return voicings;
}
