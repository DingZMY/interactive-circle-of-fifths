import { CIRCLE_CHORDS_BY_ID, type CircleChord } from "./circleData";
import {
  COMPOSITION_STORAGE_KEY,
  type CompositionStep,
  deserializeCompositionSteps
} from "./composition";
import { melodyEndBeat, type MelodyNote } from "./melody";
import type { PlaybackSettings } from "./playbackSettings";
import { buildSmartVoicing, type Voicing } from "./voicing";

export type HarmonyGridBeats = 1 | 2 | 4;

export interface HarmonySlot {
  id: string;
  startBeat: number;
  durationBeats: HarmonyGridBeats;
  chordId: string | null;
  voicingMidi: Voicing | null;
}

export interface ArrangementState {
  gridBeats: HarmonyGridBeats;
  harmonySlots: HarmonySlot[];
}

export type ArrangementPlaybackEvent =
  | {
      type: "melody";
      midi: number;
      startBeat: number;
      durationBeats: number;
    }
  | {
      type: "harmony";
      chordId: string;
      startBeat: number;
      durationBeats: number;
    };

export const ARRANGEMENT_STORAGE_KEY = "interactive-circle-of-fifths.arrangement.v1";
export const DEFAULT_HARMONY_GRID_BEATS: HarmonyGridBeats = 2;

function makeSlotId(startBeat: number, durationBeats: number): string {
  return `slot-${startBeat}-${durationBeats}`;
}

function isHarmonyGridBeats(value: unknown): value is HarmonyGridBeats {
  return value === 1 || value === 2 || value === 4;
}

function isVoicing(value: unknown): value is Voicing {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((note) => typeof note === "number" && Number.isFinite(note))
  );
}

function slotCountForLength(lengthBeats: number, gridBeats: HarmonyGridBeats): number {
  return Math.max(1, Math.ceil(Math.max(lengthBeats, gridBeats) / gridBeats));
}

export function arrangementEndBeat(notes: MelodyNote[], slots: HarmonySlot[]): number {
  const harmonyEnd = slots.reduce((end, slot) => Math.max(end, slot.startBeat + slot.durationBeats), 0);

  return Math.max(melodyEndBeat(notes), harmonyEnd);
}

export function buildArrangementPlaybackEvents(
  notes: MelodyNote[],
  slots: HarmonySlot[]
): ArrangementPlaybackEvent[] {
  return [
    ...notes.map((note) => ({
      type: "melody" as const,
      midi: note.midi,
      startBeat: note.startBeat,
      durationBeats: note.durationBeats
    })),
    ...slots.flatMap((slot) =>
      slot.chordId
        ? [
            {
              type: "harmony" as const,
              chordId: slot.chordId,
              startBeat: slot.startBeat,
              durationBeats: slot.durationBeats
            }
          ]
        : []
    )
  ].sort((a, b) => a.startBeat - b.startBeat || (a.type === "melody" ? -1 : 1));
}

export function generateHarmonyGrid(
  notes: MelodyNote[],
  existingSlots: HarmonySlot[],
  gridBeats: HarmonyGridBeats
): HarmonySlot[] {
  const count = slotCountForLength(arrangementEndBeat(notes, existingSlots), gridBeats);

  return Array.from({ length: count }, (_, index) => {
    const existing = existingSlots[index];

    return {
      id: existing?.id ?? makeSlotId(index * gridBeats, gridBeats),
      startBeat: index * gridBeats,
      durationBeats: gridBeats,
      chordId: existing?.chordId ?? null,
      voicingMidi: existing?.voicingMidi ?? null
    };
  });
}

export function revoiceHarmonySlots(slots: HarmonySlot[], settings: PlaybackSettings): HarmonySlot[] {
  let previousVoicing: Voicing | undefined;

  return slots.map((slot) => {
    const chord = slot.chordId ? CIRCLE_CHORDS_BY_ID.get(slot.chordId) : undefined;

    if (!chord) {
      return { ...slot, chordId: null, voicingMidi: null };
    }

    const voicingMidi = buildSmartVoicing(chord, settings, previousVoicing);
    previousVoicing = voicingMidi;

    return { ...slot, voicingMidi };
  });
}

export function assignChordToSlot(
  slots: HarmonySlot[],
  slotId: string,
  chord: CircleChord,
  settings: PlaybackSettings
): HarmonySlot[] {
  return revoiceHarmonySlots(
    slots.map((slot) => (slot.id === slotId ? { ...slot, chordId: chord.id } : slot)),
    settings
  );
}

export function assignChordToSelectedOrNextEmpty(
  slots: HarmonySlot[],
  selectedSlotId: string | null,
  chord: CircleChord,
  settings: PlaybackSettings,
  gridBeats: HarmonyGridBeats
): { slots: HarmonySlot[]; selectedSlotId: string } {
  const targetSlot =
    (selectedSlotId ? slots.find((slot) => slot.id === selectedSlotId) : undefined) ??
    slots.find((slot) => !slot.chordId);

  if (targetSlot) {
    return {
      slots: assignChordToSlot(slots, targetSlot.id, chord, settings),
      selectedSlotId: targetSlot.id
    };
  }

  const startBeat = slots.length === 0 ? 0 : Math.max(...slots.map((slot) => slot.startBeat + slot.durationBeats));
  const appendedSlot: HarmonySlot = {
    id: makeSlotId(startBeat, gridBeats),
    startBeat,
    durationBeats: gridBeats,
    chordId: chord.id,
    voicingMidi: null
  };

  return {
    slots: revoiceHarmonySlots([...slots, appendedSlot], settings),
    selectedSlotId: appendedSlot.id
  };
}

export function clearHarmonySlots(slots: HarmonySlot[]): HarmonySlot[] {
  return slots.map((slot) => ({ ...slot, chordId: null, voicingMidi: null }));
}

export function removeHarmonySlotChord(slots: HarmonySlot[], slotId: string): HarmonySlot[] {
  return slots.map((slot) => (slot.id === slotId ? { ...slot, chordId: null, voicingMidi: null } : slot));
}

export function moveHarmonySlotChord(
  slots: HarmonySlot[],
  slotId: string,
  direction: -1 | 1,
  settings: PlaybackSettings
): HarmonySlot[] {
  const index = slots.findIndex((slot) => slot.id === slotId);
  const nextIndex = index + direction;

  if (index < 0 || nextIndex < 0 || nextIndex >= slots.length) {
    return slots;
  }

  const next = [...slots];
  const currentChordId = next[index].chordId;
  const targetChordId = next[nextIndex].chordId;

  next[index] = { ...next[index], chordId: targetChordId, voicingMidi: null };
  next[nextIndex] = { ...next[nextIndex], chordId: currentChordId, voicingMidi: null };

  return revoiceHarmonySlots(next, settings);
}

export function slotsFromLegacyComposition(steps: CompositionStep[], gridBeats: HarmonyGridBeats): HarmonySlot[] {
  return steps.map((step, index) => ({
    id: makeSlotId(index * gridBeats, gridBeats),
    startBeat: index * gridBeats,
    durationBeats: gridBeats,
    chordId: step.chordId,
    voicingMidi: step.voicingMidi
  }));
}

function deserializeHarmonySlots(value: unknown, gridBeats: HarmonyGridBeats): HarmonySlot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((slot, index) => {
    if (!slot || typeof slot !== "object") {
      return [];
    }

    const candidate = slot as Partial<HarmonySlot>;
    const chord = candidate.chordId ? CIRCLE_CHORDS_BY_ID.get(candidate.chordId) : undefined;

    return [
      {
        id: typeof candidate.id === "string" ? candidate.id : makeSlotId(index * gridBeats, gridBeats),
        startBeat: typeof candidate.startBeat === "number" ? candidate.startBeat : index * gridBeats,
        durationBeats: gridBeats,
        chordId: chord ? chord.id : null,
        voicingMidi: chord && isVoicing(candidate.voicingMidi) ? candidate.voicingMidi : null
      }
    ];
  });
}

export function deserializeArrangementState(raw: string | null): ArrangementState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const candidate = parsed as Partial<ArrangementState>;
    const gridBeats = isHarmonyGridBeats(candidate.gridBeats)
      ? candidate.gridBeats
      : DEFAULT_HARMONY_GRID_BEATS;

    return {
      gridBeats,
      harmonySlots: deserializeHarmonySlots(candidate.harmonySlots, gridBeats)
    };
  } catch {
    return null;
  }
}

export function loadArrangementState(settings: PlaybackSettings): ArrangementState {
  if (typeof window === "undefined") {
    return { gridBeats: DEFAULT_HARMONY_GRID_BEATS, harmonySlots: [] };
  }

  const saved = deserializeArrangementState(window.localStorage.getItem(ARRANGEMENT_STORAGE_KEY));

  if (saved) {
    return { ...saved, harmonySlots: revoiceHarmonySlots(saved.harmonySlots, settings) };
  }

  const legacySteps = deserializeCompositionSteps(window.localStorage.getItem(COMPOSITION_STORAGE_KEY), settings);

  return {
    gridBeats: DEFAULT_HARMONY_GRID_BEATS,
    harmonySlots: slotsFromLegacyComposition(legacySteps, DEFAULT_HARMONY_GRID_BEATS)
  };
}

export function saveArrangementState(state: ArrangementState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ARRANGEMENT_STORAGE_KEY, JSON.stringify(state));
}
