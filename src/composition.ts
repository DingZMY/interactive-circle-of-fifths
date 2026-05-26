import { CIRCLE_CHORDS_BY_ID, type CircleChord } from "./circleData";
import { type PlaybackSettings } from "./playbackSettings";
import { buildSmartVoicing, type Voicing } from "./voicing";

export interface CompositionStep {
  id: string;
  chordId: string;
  durationBeats: 2;
  voicingMidi: Voicing;
  createdAt: number;
}

export const COMPOSITION_STORAGE_KEY = "interactive-circle-of-fifths.composition.v1";
export const STEP_DURATION_BEATS = 2;

function makeStepId(createdAt: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `step-${createdAt}-${Math.random().toString(36).slice(2, 9)}`;
}

function isVoicing(value: unknown): value is Voicing {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((note) => typeof note === "number" && Number.isFinite(note))
  );
}

export function createCompositionStep(
  chord: CircleChord,
  voicingMidi: Voicing,
  createdAt = Date.now(),
  id = makeStepId(createdAt)
): CompositionStep {
  return {
    id,
    chordId: chord.id,
    durationBeats: STEP_DURATION_BEATS,
    voicingMidi,
    createdAt
  };
}

export function appendCompositionStep(
  steps: CompositionStep[],
  chord: CircleChord,
  settings: PlaybackSettings,
  createdAt = Date.now(),
  id?: string
): CompositionStep[] {
  const previousVoicing = steps[steps.length - 1]?.voicingMidi;
  const voicing = buildSmartVoicing(chord, settings, previousVoicing);

  return [...steps, createCompositionStep(chord, voicing, createdAt, id)];
}

export function removeCompositionStep(steps: CompositionStep[], id: string): CompositionStep[] {
  return steps.filter((step) => step.id !== id);
}

export function moveCompositionStep(steps: CompositionStep[], id: string, direction: -1 | 1): CompositionStep[] {
  const index = steps.findIndex((step) => step.id === id);
  const nextIndex = index + direction;

  if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) {
    return steps;
  }

  const next = [...steps];
  const [step] = next.splice(index, 1);
  next.splice(nextIndex, 0, step);

  return next;
}

export function clearComposition(): CompositionStep[] {
  return [];
}

export function revoiceComposition(steps: CompositionStep[], settings: PlaybackSettings): CompositionStep[] {
  let previousVoicing: Voicing | undefined;

  return steps.flatMap((step) => {
    const chord = CIRCLE_CHORDS_BY_ID.get(step.chordId);

    if (!chord) {
      return [];
    }

    const voicingMidi = buildSmartVoicing(chord, settings, previousVoicing);
    previousVoicing = voicingMidi;

    return [{ ...step, voicingMidi }];
  });
}

export function timelineDurationSeconds(steps: CompositionStep[], tempoBpm: number): number {
  const beats = steps.reduce((sum, step) => sum + step.durationBeats, 0);

  return (beats * 60) / tempoBpm;
}

export function deserializeCompositionSteps(raw: string | null, settings: PlaybackSettings): CompositionStep[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    let previousVoicing: Voicing | undefined;
    const steps: CompositionStep[] = [];

    for (const value of parsed) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const candidate = value as Partial<CompositionStep>;
      const chord = typeof candidate.chordId === "string" ? CIRCLE_CHORDS_BY_ID.get(candidate.chordId) : undefined;

      if (!chord || typeof candidate.id !== "string" || typeof candidate.createdAt !== "number") {
        continue;
      }

      const voicingMidi = isVoicing(candidate.voicingMidi)
        ? candidate.voicingMidi
        : buildSmartVoicing(chord, settings, previousVoicing);

      previousVoicing = voicingMidi;
      steps.push({
        id: candidate.id,
        chordId: chord.id,
        durationBeats: STEP_DURATION_BEATS,
        voicingMidi,
        createdAt: candidate.createdAt
      });
    }

    return steps;
  } catch {
    return [];
  }
}

export function loadCompositionSteps(settings: PlaybackSettings): CompositionStep[] {
  if (typeof window === "undefined") {
    return [];
  }

  return deserializeCompositionSteps(window.localStorage.getItem(COMPOSITION_STORAGE_KEY), settings);
}

export function saveCompositionSteps(steps: CompositionStep[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(COMPOSITION_STORAGE_KEY, JSON.stringify(steps));
}
