export interface MelodyNote {
  id: string;
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  createdAt: number;
}

export interface RawMelodyNote {
  id: string;
  midi: number;
  startMs: number;
  durationMs: number;
  velocity: number;
  createdAt: number;
}

export interface ActiveMelodyKey {
  key: string;
  midi: number;
  pressedAtMs: number;
}

export interface ActiveMelodyNote {
  id: string;
  key: string;
  midi: number;
  startMs: number;
  velocity: number;
  createdAt: number;
}

export interface MelodyRecorderState {
  startedAtMs: number;
  octaveOffset: number;
  activeKeys: ActiveMelodyKey[];
  currentNote: ActiveMelodyNote | null;
  rawNotes: RawMelodyNote[];
}

export const MELODY_STORAGE_KEY = "interactive-circle-of-fifths.melody.v1";
export const MELODY_QUANTIZE_BEATS = 0.5;
export const BASE_KEYBOARD_MIDI = 60;

export const KEYBOARD_MIDI_OFFSETS = new Map<string, number>([
  ["a", 0],
  ["w", 1],
  ["s", 2],
  ["e", 3],
  ["d", 4],
  ["f", 5],
  ["t", 6],
  ["g", 7],
  ["y", 8],
  ["h", 9],
  ["u", 10],
  ["j", 11],
  ["k", 12]
]);

function makeNoteId(createdAt: number, midi: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `melody-${createdAt}-${midi}-${Math.random().toString(36).slice(2, 8)}`;
}

function notesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  return startA < startB + durationB && startB < startA + durationA;
}

export function createGridMelodyNote(
  midi: number,
  startBeat: number,
  durationBeats: number,
  createdAt = Date.now(),
  id = makeNoteId(createdAt, midi)
): MelodyNote {
  return {
    id,
    midi,
    startBeat,
    durationBeats,
    velocity: 0.84,
    createdAt
  };
}

export function toggleGridMelodyNote(
  notes: MelodyNote[],
  midi: number,
  startBeat: number,
  durationBeats: number,
  createdAt = Date.now()
): MelodyNote[] {
  const selectedNote = notes.find(
    (note) => note.midi === midi && startBeat >= note.startBeat && startBeat < note.startBeat + note.durationBeats
  );

  if (selectedNote) {
    return notes.filter((note) => note.id !== selectedNote.id);
  }

  return [
    ...notes.filter(
      (note) => note.midi !== midi || !notesOverlap(note.startBeat, note.durationBeats, startBeat, durationBeats)
    ),
    createGridMelodyNote(midi, startBeat, durationBeats, createdAt)
  ].sort((a, b) => a.startBeat - b.startBeat || b.midi - a.midi || a.createdAt - b.createdAt);
}

export function normalizeKeyboardKey(key: string): string {
  return key.toLowerCase();
}

export function midiForKeyboardKey(key: string, octaveOffset: number): number | null {
  const offset = KEYBOARD_MIDI_OFFSETS.get(normalizeKeyboardKey(key));

  if (offset === undefined) {
    return null;
  }

  return BASE_KEYBOARD_MIDI + octaveOffset * 12 + offset;
}

export function createMelodyRecorderState(startedAtMs: number, octaveOffset: number): MelodyRecorderState {
  return {
    startedAtMs,
    octaveOffset,
    activeKeys: [],
    currentNote: null,
    rawNotes: []
  };
}

function msToBeats(ms: number, tempoBpm: number): number {
  return ms / (60000 / tempoBpm);
}

function quantize(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function closeCurrentNote(state: MelodyRecorderState, nowMs: number): MelodyRecorderState {
  if (!state.currentNote) {
    return state;
  }

  const durationMs = Math.max(1, nowMs - state.currentNote.startMs);

  return {
    ...state,
    currentNote: null,
    rawNotes: [
      ...state.rawNotes,
      {
        id: state.currentNote.id,
        midi: state.currentNote.midi,
        startMs: state.currentNote.startMs,
        durationMs,
        velocity: state.currentNote.velocity,
        createdAt: state.currentNote.createdAt
      }
    ]
  };
}

function openCurrentNote(state: MelodyRecorderState, key: string, midi: number, nowMs: number): MelodyRecorderState {
  return {
    ...state,
    currentNote: {
      id: makeNoteId(nowMs, midi),
      key,
      midi,
      startMs: nowMs,
      velocity: 0.82,
      createdAt: nowMs
    }
  };
}

export function handleMelodyKeyDown(
  state: MelodyRecorderState,
  key: string,
  nowMs: number
): { state: MelodyRecorderState; previewMidi: number | null } {
  const normalizedKey = normalizeKeyboardKey(key);
  const midi = midiForKeyboardKey(normalizedKey, state.octaveOffset);

  if (midi === null || state.activeKeys.some((activeKey) => activeKey.key === normalizedKey)) {
    return { state, previewMidi: null };
  }

  const closed = closeCurrentNote(state, nowMs);
  const next = openCurrentNote(
    {
      ...closed,
      activeKeys: [...closed.activeKeys, { key: normalizedKey, midi, pressedAtMs: nowMs }]
    },
    normalizedKey,
    midi,
    nowMs
  );

  return { state: next, previewMidi: midi };
}

export function handleMelodyKeyUp(state: MelodyRecorderState, key: string, nowMs: number): MelodyRecorderState {
  const normalizedKey = normalizeKeyboardKey(key);
  const remainingKeys = state.activeKeys.filter((activeKey) => activeKey.key !== normalizedKey);

  if (state.currentNote?.key !== normalizedKey) {
    return { ...state, activeKeys: remainingKeys };
  }

  const closed = closeCurrentNote({ ...state, activeKeys: remainingKeys }, nowMs);
  const fallbackKey = remainingKeys[remainingKeys.length - 1];

  if (!fallbackKey) {
    return closed;
  }

  return openCurrentNote(closed, fallbackKey.key, fallbackKey.midi, nowMs);
}

export function quantizeRawMelodyNotes(
  rawNotes: RawMelodyNote[],
  startedAtMs: number,
  tempoBpm: number,
  quantizeBeats = MELODY_QUANTIZE_BEATS
): MelodyNote[] {
  return rawNotes
    .map((note) => {
      const rawStartBeat = msToBeats(note.startMs - startedAtMs, tempoBpm);
      const rawEndBeat = rawStartBeat + msToBeats(note.durationMs, tempoBpm);
      const startBeat = Math.max(0, quantize(rawStartBeat, quantizeBeats));
      const endBeat = Math.max(startBeat + quantizeBeats, quantize(rawEndBeat, quantizeBeats));

      return {
        id: note.id,
        midi: note.midi,
        startBeat,
        durationBeats: endBeat - startBeat,
        velocity: note.velocity,
        createdAt: note.createdAt
      };
    })
    .sort((a, b) => a.startBeat - b.startBeat || a.createdAt - b.createdAt);
}

export function finishMelodyRecording(
  state: MelodyRecorderState,
  nowMs: number,
  tempoBpm: number,
  quantizeBeats = MELODY_QUANTIZE_BEATS
): MelodyNote[] {
  const closed = closeCurrentNote(state, nowMs);

  return quantizeRawMelodyNotes(closed.rawNotes, state.startedAtMs, tempoBpm, quantizeBeats);
}

export function melodyEndBeat(notes: MelodyNote[]): number {
  return notes.reduce((end, note) => Math.max(end, note.startBeat + note.durationBeats), 0);
}

function isMelodyNote(value: unknown): value is MelodyNote {
  if (!value || typeof value !== "object") {
    return false;
  }

  const note = value as Partial<MelodyNote>;

  return (
    typeof note.id === "string" &&
    typeof note.midi === "number" &&
    typeof note.startBeat === "number" &&
    typeof note.durationBeats === "number" &&
    typeof note.velocity === "number" &&
    typeof note.createdAt === "number"
  );
}

export function deserializeMelodyNotes(raw: string | null): MelodyNote[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isMelodyNote).sort((a, b) => a.startBeat - b.startBeat || a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export function loadMelodyNotes(): MelodyNote[] {
  if (typeof window === "undefined") {
    return [];
  }

  return deserializeMelodyNotes(window.localStorage.getItem(MELODY_STORAGE_KEY));
}

export function saveMelodyNotes(notes: MelodyNote[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MELODY_STORAGE_KEY, JSON.stringify(notes));
}
