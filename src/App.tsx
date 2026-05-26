import { useEffect, useMemo, useRef, useState } from "react";
import { playArrangement, playChordPreview, playMelodyNotePreview, stopPlayback } from "./audio";
import {
  arrangementEndBeat,
  assignChordToSelectedOrNextEmpty,
  clearHarmonySlots,
  generateHarmonyGrid,
  type HarmonyGridBeats,
  type HarmonySlot,
  loadArrangementState,
  moveHarmonySlotChord,
  removeHarmonySlotChord,
  revoiceHarmonySlots,
  saveArrangementState
} from "./arrangement";
import {
  CIRCLE_CENTER,
  CIRCLE_CHORDS,
  CIRCLE_CHORDS_BY_ID,
  CIRCLE_VIEWBOX_SIZE,
  FIFTHS,
  INNER_HOLE_RADIUS,
  MAJOR_RING_OUTER,
  MINOR_RING_OUTER,
  OUTER_RADIUS,
  type CircleChord,
  polarToCartesian,
  textColorForBackground
} from "./circleData";
import {
  type MelodyNote,
  type MelodyRecorderState,
  createMelodyRecorderState,
  finishMelodyRecording,
  handleMelodyKeyDown,
  handleMelodyKeyUp,
  loadMelodyNotes,
  midiForKeyboardKey,
  normalizeKeyboardKey,
  saveMelodyNotes
} from "./melody";
import { MODES, type ModeName, type ModePlan, buildModePlan, findModeMembership } from "./modes";
import { getChordTones, qualityLabel } from "./music";
import {
  REGISTER_OPTIONS,
  SOUND_PRESETS,
  SPREAD_OPTIONS,
  type PlaybackSettings,
  loadPlaybackSettings,
  savePlaybackSettings
} from "./playbackSettings";
import { type VisitorCounterResult, hitVisitorCounter } from "./visitorCounter";

type InteractionMode = "explore" | "compose";

const GRID_OPTIONS: HarmonyGridBeats[] = [1, 2, 4];
const BEAT_WIDTH = 72;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function describeSectorPath(index: number, innerRadius: number, outerRadius: number): string {
  const startAngle = -105 + index * 30;
  const endAngle = startAngle + 30;
  const outerStart = polarToCartesian(outerRadius, startAngle);
  const outerEnd = polarToCartesian(outerRadius, endAngle);
  const innerEnd = polarToCartesian(innerRadius, endAngle);
  const innerStart = polarToCartesian(innerRadius, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    "Z"
  ].join(" ");
}

function describeArc(radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(radius, startAngle);
  const end = polarToCartesian(radius, endAngle);

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

function describeRadialLine(radiusStart: number, radiusEnd: number, angle: number): string {
  const start = polarToCartesian(radiusStart, angle);
  const end = polarToCartesian(radiusEnd, angle);

  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

function layerBounds(layer: CircleChord["layer"]): { inner: number; outer: number } {
  if (layer === "major") {
    return { inner: INNER_HOLE_RADIUS, outer: MAJOR_RING_OUTER };
  }

  if (layer === "minor") {
    return { inner: MAJOR_RING_OUTER, outer: MINOR_RING_OUTER };
  }

  return { inner: MINOR_RING_OUTER, outer: OUTER_RADIUS };
}

function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function optionLabel(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
}

function CellHighlight({ chord }: { chord: CircleChord }) {
  const startAngle = -105 + chord.sectorIndex * 30;
  const endAngle = startAngle + 30;
  const bounds = layerBounds(chord.layer);

  return (
    <g className="mode-cell-highlight">
      <path d={describeArc(bounds.inner, startAngle, endAngle)} />
      <path d={describeArc(bounds.outer, startAngle, endAngle)} />
      <path d={describeRadialLine(bounds.inner, bounds.outer, startAngle)} />
      <path d={describeRadialLine(bounds.inner, bounds.outer, endAngle)} />
    </g>
  );
}

function chordButtonSize(layer: CircleChord["layer"]): { width: number; height: number; radius: number } {
  if (layer === "diminished") {
    return { width: 80, height: 50, radius: 7 };
  }

  if (layer === "minor") {
    return { width: 82, height: 48, radius: 16 };
  }

  return { width: 76, height: 48, radius: 8 };
}

function chordTextSize(label: string): number {
  if (label.length >= 4) {
    return 24;
  }

  if (label.length === 3) {
    return 28;
  }

  return 32;
}

function CircleButton({
  chord,
  active,
  inMode,
  onSelect
}: {
  chord: CircleChord;
  active: boolean;
  inMode: boolean;
  onSelect: (chord: CircleChord) => void;
}) {
  const position = polarToCartesian(chord.radius, chord.angle);
  const size = chordButtonSize(chord.layer);
  const textColor = textColorForBackground(chord.color);

  function handleKeyDown(event: React.KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(chord);
    }
  }

  return (
    <g
      className="circle-button"
      role="button"
      tabIndex={0}
      aria-label={`${chord.label} ${qualityLabel(chord.quality)} chord`}
      transform={`translate(${position.x} ${position.y}) rotate(${chord.angle + 90})`}
      onClick={() => onSelect(chord)}
      onKeyDown={handleKeyDown}
    >
      <rect
        className="chord-shadow"
        x={-size.width / 2 + 3}
        y={-size.height / 2 + 5}
        width={size.width}
        height={size.height}
        rx={size.radius}
      />
      <rect
        className={`chord-plate${inMode ? " is-in-mode" : ""}`}
        x={-size.width / 2}
        y={-size.height / 2}
        width={size.width}
        height={size.height}
        rx={size.radius}
        fill={chord.color}
      />
      {active ? (
        <rect
          className="active-chord-outline"
          x={-size.width / 2 + 4}
          y={-size.height / 2 + 4}
          width={size.width - 8}
          height={size.height - 8}
          rx={Math.max(4, size.radius - 2)}
        />
      ) : null}
      <text
        className="chord-text"
        fill={textColor}
        dominantBaseline="middle"
        fontSize={chordTextSize(chord.label)}
        textAnchor="middle"
      >
        {chord.label}
      </text>
    </g>
  );
}

function CircleOfFifths({
  selectedChord,
  modeChordIds,
  modeChords,
  onSelectChord
}: {
  selectedChord: CircleChord;
  modeChordIds: Set<string>;
  modeChords: CircleChord[];
  onSelectChord: (chord: CircleChord) => void;
}) {
  return (
    <section className="circle-panel" aria-label="Circle of fifths">
      <svg
        className="circle-svg"
        viewBox={`0 0 ${CIRCLE_VIEWBOX_SIZE} ${CIRCLE_VIEWBOX_SIZE}`}
        role="img"
        aria-label="Interactive circle of fifths"
      >
        <rect width={CIRCLE_VIEWBOX_SIZE} height={CIRCLE_VIEWBOX_SIZE} fill="#f6f6f4" />
        {Array.from({ length: 12 }, (_, index) => (
          <path
            className="sector"
            d={describeSectorPath(index, INNER_HOLE_RADIUS, OUTER_RADIUS)}
            key={index}
          />
        ))}
        <circle className="ring-line" cx={CIRCLE_CENTER} cy={CIRCLE_CENTER} r={INNER_HOLE_RADIUS} />
        <circle className="ring-line" cx={CIRCLE_CENTER} cy={CIRCLE_CENTER} r={MAJOR_RING_OUTER} />
        <circle className="ring-line" cx={CIRCLE_CENTER} cy={CIRCLE_CENTER} r={MINOR_RING_OUTER} />
        <circle className="ring-line heavy" cx={CIRCLE_CENTER} cy={CIRCLE_CENTER} r={OUTER_RADIUS} />

        {modeChords.map((chord) => (
          <CellHighlight chord={chord} key={`highlight-${chord.id}`} />
        ))}

        {CIRCLE_CHORDS.map((chord) => (
          <CircleButton
            chord={chord}
            active={selectedChord.id === chord.id}
            inMode={modeChordIds.has(chord.id)}
            key={chord.id}
            onSelect={onSelectChord}
          />
        ))}

        <circle cx={CIRCLE_CENTER} cy={CIRCLE_CENTER} r={INNER_HOLE_RADIUS - 8} fill="#fff" />
        <text className="center-title" x={CIRCLE_CENTER} y={CIRCLE_CENTER - 10}>
          Circle
        </text>
        <text className="center-subtitle" x={CIRCLE_CENTER} y={CIRCLE_CENTER + 24}>
          of Fifths
        </text>
      </svg>
    </section>
  );
}

function ModeSwitch({
  mode,
  onModeChange
}: {
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
}) {
  return (
    <div className="mode-switch" aria-label="Interaction mode">
      <button
        aria-pressed={mode === "explore"}
        className={mode === "explore" ? "is-active" : ""}
        onClick={() => onModeChange("explore")}
        type="button"
      >
        Explore
      </button>
      <button
        aria-pressed={mode === "compose"}
        className={mode === "compose" ? "is-active" : ""}
        onClick={() => onModeChange("compose")}
        type="button"
      >
        Compose
      </button>
    </div>
  );
}

function SoundModule({
  settings,
  onChange
}: {
  settings: PlaybackSettings;
  onChange: (settings: PlaybackSettings) => void;
}) {
  function update(partial: Partial<PlaybackSettings>) {
    onChange({ ...settings, ...partial });
  }

  return (
    <section className="sound-module" aria-label="Sound module">
      <div>
        <h2>Sound Module</h2>
        <p>{SOUND_PRESETS.find((preset) => preset.id === settings.preset)?.label ?? "Custom"}</p>
      </div>
      <div className="module-grid">
        <label>
          <span>Preset</span>
          <select value={settings.preset} onChange={(event) => update({ preset: event.target.value as PlaybackSettings["preset"] })}>
            {SOUND_PRESETS.map((preset) => (
              <option value={preset.id} key={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Tempo</span>
          <input
            max={140}
            min={52}
            onChange={(event) => update({ tempoBpm: Number(event.target.value) })}
            type="range"
            value={settings.tempoBpm}
          />
          <strong>{settings.tempoBpm} BPM</strong>
        </label>
        <label>
          <span>Register</span>
          <select value={settings.register} onChange={(event) => update({ register: event.target.value as PlaybackSettings["register"] })}>
            {REGISTER_OPTIONS.map((option) => (
              <option value={option} key={option}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Spread</span>
          <select value={settings.spread} onChange={(event) => update({ spread: event.target.value as PlaybackSettings["spread"] })}>
            {SPREAD_OPTIONS.map((option) => (
              <option value={option} key={option}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Motion</span>
          <input
            max={100}
            min={0}
            onChange={(event) => update({ motion: Number(event.target.value) / 100 })}
            title="Arpeggio spread, filter sweep, and vibrato motion"
            type="range"
            value={Math.round(settings.motion * 100)}
          />
          <strong>{Math.round(settings.motion * 100)}%</strong>
        </label>
        <label>
          <span>Space</span>
          <input
            max={100}
            min={0}
            onChange={(event) => update({ reverbAmount: Number(event.target.value) / 100 })}
            title="Delay, feedback, and ambience amount"
            type="range"
            value={Math.round(settings.reverbAmount * 100)}
          />
          <strong>{Math.round(settings.reverbAmount * 100)}%</strong>
        </label>
      </div>
    </section>
  );
}

function ArrangementTimeline({
  melodyNotes,
  harmonySlots,
  selectedSlotId,
  gridBeats,
  modePlan,
  isRecording,
  isPlaying,
  activeMidi,
  octaveOffset,
  onRecordToggle,
  onPlayToggle,
  onGridChange,
  onSelectSlot,
  onRemoveChord,
  onMoveChord,
  onClearMelody,
  onClearHarmony,
  onClearAll
}: {
  melodyNotes: MelodyNote[];
  harmonySlots: HarmonySlot[];
  selectedSlotId: string | null;
  gridBeats: HarmonyGridBeats;
  modePlan: ModePlan;
  isRecording: boolean;
  isPlaying: boolean;
  activeMidi: number | null;
  octaveOffset: number;
  onRecordToggle: () => void;
  onPlayToggle: () => void;
  onGridChange: (gridBeats: HarmonyGridBeats) => void;
  onSelectSlot: (slot: HarmonySlot) => void;
  onRemoveChord: (slotId: string) => void;
  onMoveChord: (slotId: string, direction: -1 | 1) => void;
  onClearMelody: () => void;
  onClearHarmony: () => void;
  onClearAll: () => void;
}) {
  const totalBeats = Math.max(1, arrangementEndBeat(melodyNotes, harmonySlots));
  const trackWidth = totalBeats * BEAT_WIDTH;
  const minMidi = melodyNotes.length > 0 ? Math.min(...melodyNotes.map((note) => note.midi)) : 60;
  const maxMidi = melodyNotes.length > 0 ? Math.max(...melodyNotes.map((note) => note.midi)) : 72;
  const midiRange = Math.max(1, maxMidi - minMidi);

  return (
    <section className="timeline-panel arrangement-panel" aria-label="Composition timeline">
      <div className="timeline-header">
        <div>
          <p>Composition</p>
          <h2>
            {melodyNotes.length} notes / {harmonySlots.filter((slot) => slot.chordId).length} chords
          </h2>
        </div>
        <div className="timeline-actions">
          <button className={isRecording ? "is-danger" : ""} onClick={onRecordToggle} type="button">
            {isRecording ? "Stop Rec" : "Record"}
          </button>
          <button disabled={melodyNotes.length === 0 && harmonySlots.every((slot) => !slot.chordId)} onClick={onPlayToggle} type="button">
            {isPlaying ? "Stop" : "Play"}
          </button>
          <label className="grid-select">
            <span>Grid</span>
            <select value={gridBeats} onChange={(event) => onGridChange(Number(event.target.value) as HarmonyGridBeats)}>
              {GRID_OPTIONS.map((option) => (
                <option value={option} key={option}>
                  {option} beat{option > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="record-status">
        <span className={isRecording ? "record-dot is-active" : "record-dot"} />
        <strong>{isRecording ? "Recording" : "Ready"}</strong>
        <small>
          {activeMidi === null ? `Octave ${octaveOffset >= 0 ? "+" : ""}${octaveOffset}` : `${noteName(activeMidi)} active`}
        </small>
      </div>

      <div className="arrangement-scroll">
        <div className="lane-label">Melody</div>
        <div className="melody-lane" style={{ width: trackWidth }}>
          {melodyNotes.length === 0 ? (
            <div className="empty-lane">No melody</div>
          ) : (
            melodyNotes.map((note) => {
              const top = 10 + ((maxMidi - note.midi) / midiRange) * 56;

              return (
                <button
                  className="melody-note"
                  key={note.id}
                  style={{
                    left: note.startBeat * BEAT_WIDTH,
                    top,
                    width: Math.max(32, note.durationBeats * BEAT_WIDTH - 4)
                  }}
                  title={noteName(note.midi)}
                  type="button"
                >
                  {noteName(note.midi)}
                </button>
              );
            })
          )}
        </div>

        <div className="lane-label">Harmony</div>
        <ol className="harmony-lane" style={{ width: trackWidth }}>
          {harmonySlots.map((slot) => {
            const chord = slot.chordId ? CIRCLE_CHORDS_BY_ID.get(slot.chordId) : undefined;
            const membership = chord ? findModeMembership(modePlan, chord) : undefined;

            return (
              <li className={`harmony-slot${selectedSlotId === slot.id ? " is-selected" : ""}`} key={slot.id}>
                <button
                  className="harmony-slot-main"
                  onClick={() => onSelectSlot(slot)}
                  style={{ width: slot.durationBeats * BEAT_WIDTH - 6 }}
                  type="button"
                >
                  {chord ? (
                    <>
                      <span className="step-color" style={{ background: chord.color }} />
                      <strong>{chord.label}</strong>
                      <small>{membership ? membership.roman : "outside"}</small>
                    </>
                  ) : (
                    <strong>Empty</strong>
                  )}
                </button>
                <div className="step-controls">
                  <button disabled={!chord || slot.startBeat === 0} onClick={() => onMoveChord(slot.id, -1)} type="button">
                    {"<"}
                  </button>
                  <button
                    disabled={!chord || slot.startBeat + slot.durationBeats >= totalBeats}
                    onClick={() => onMoveChord(slot.id, 1)}
                    type="button"
                  >
                    {">"}
                  </button>
                  <button disabled={!chord} onClick={() => onRemoveChord(slot.id)} type="button">
                    x
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="timeline-actions secondary-actions">
        <button disabled={melodyNotes.length === 0} onClick={onClearMelody} type="button">
          Clear Melody
        </button>
        <button disabled={harmonySlots.every((slot) => !slot.chordId)} onClick={onClearHarmony} type="button">
          Clear Harmony
        </button>
        <button disabled={melodyNotes.length === 0 && harmonySlots.every((slot) => !slot.chordId)} onClick={onClearAll} type="button">
          Clear All
        </button>
      </div>
    </section>
  );
}

function DetailPanel({
  tonic,
  mode,
  selectedChord,
  playbackSettings,
  onTonicChange,
  onModeChange,
  onPlaybackSettingsChange
}: {
  tonic: string;
  mode: ModeName;
  selectedChord: CircleChord;
  playbackSettings: PlaybackSettings;
  onTonicChange: (tonic: string) => void;
  onModeChange: (mode: ModeName) => void;
  onPlaybackSettingsChange: (settings: PlaybackSettings) => void;
}) {
  const modePlan = useMemo(() => buildModePlan(tonic, mode), [mode, tonic]);
  const membership = findModeMembership(modePlan, selectedChord);
  const selectedTones = getChordTones(selectedChord.rootLabel, selectedChord.quality).map((tone) => tone.label);

  return (
    <aside className="detail-panel">
      <SoundModule settings={playbackSettings} onChange={onPlaybackSettingsChange} />

      <section className="control-block" aria-label="Mode selector">
        <label>
          <span>Tonic</span>
          <select value={tonic} onChange={(event) => onTonicChange(event.target.value)}>
            {FIFTHS.map((candidate) => (
              <option value={candidate.label} key={candidate.label}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Mode</span>
          <select value={mode} onChange={(event) => onModeChange(event.target.value as ModeName)}>
            {MODES.map((candidate) => (
              <option value={candidate.name} key={candidate.name}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="info-block">
        <h2>
          {tonic} {mode}
        </h2>
        <div className="pill-row">
          {modePlan.scale.map((note) => (
            <span className="note-pill" key={`${note.label}-${note.pitchClass}`}>
              {note.label}
            </span>
          ))}
        </div>
      </section>

      <section className="info-block">
        <h2>Diatonic Triads</h2>
        <ol className="mode-chord-list">
          {modePlan.chords.map((chord) => (
            <li className={chord.circleChord.id === selectedChord.id ? "is-current" : ""} key={chord.circleChord.id}>
              <span>{chord.roman}</span>
              <strong>{chord.label}</strong>
              <small>{chord.tones.join(" ")}</small>
            </li>
          ))}
        </ol>
      </section>

      <section className="info-block selected-block">
        <h2>Selected Chord</h2>
        <div className="selected-name">{selectedChord.label}</div>
        <dl>
          <div>
            <dt>Quality</dt>
            <dd>{qualityLabel(selectedChord.quality)}</dd>
          </div>
          <div>
            <dt>Tones</dt>
            <dd>{selectedTones.join(" ")}</dd>
          </div>
          <div>
            <dt>Mode Role</dt>
            <dd>{membership ? `${membership.roman} / degree ${membership.degree}` : "Outside current mode"}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}

function FooterCounter({ counter }: { counter: VisitorCounterResult }) {
  return (
    <footer className="site-footer">
      <span>{counter.label}</span>
    </footer>
  );
}

export default function App() {
  const [tonic, setTonic] = useState("C");
  const [mode, setMode] = useState<ModeName>("Ionian");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("explore");
  const [playbackSettings, setPlaybackSettings] = useState<PlaybackSettings>(() => loadPlaybackSettings());
  const [melodyNotes, setMelodyNotes] = useState<MelodyNote[]>(() => loadMelodyNotes());
  const [initialArrangement] = useState(() => loadArrangementState(playbackSettings));
  const [gridBeats, setGridBeats] = useState<HarmonyGridBeats>(initialArrangement.gridBeats);
  const [harmonySlots, setHarmonySlots] = useState<HarmonySlot[]>(() =>
    generateHarmonyGrid(melodyNotes, initialArrangement.harmonySlots, initialArrangement.gridBeats)
  );
  const [selectedChord, setSelectedChord] = useState<CircleChord>(CIRCLE_CHORDS[0]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(harmonySlots[0]?.id ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [octaveOffset, setOctaveOffset] = useState(0);
  const [activeMidi, setActiveMidi] = useState<number | null>(null);
  const [visitorCounter, setVisitorCounter] = useState<VisitorCounterResult>({
    status: "loading",
    label: "Visits loading",
    count: null
  });
  const recorderRef = useRef<MelodyRecorderState | null>(null);
  const modePlan = useMemo(() => buildModePlan(tonic, mode), [mode, tonic]);
  const modeChordIds = useMemo(
    () => new Set(modePlan.chords.map((chord) => chord.circleChord.id)),
    [modePlan]
  );
  const modeChords = useMemo(() => modePlan.chords.map((chord) => chord.circleChord), [modePlan]);

  useEffect(() => {
    savePlaybackSettings(playbackSettings);
  }, [playbackSettings]);

  useEffect(() => {
    saveMelodyNotes(melodyNotes);
  }, [melodyNotes]);

  useEffect(() => {
    saveArrangementState({ gridBeats, harmonySlots });
  }, [gridBeats, harmonySlots]);

  useEffect(() => {
    setHarmonySlots((slots) => generateHarmonyGrid(melodyNotes, slots, gridBeats));
  }, [melodyNotes, gridBeats]);

  useEffect(() => {
    void hitVisitorCounter(window.location.hostname).then(setVisitorCounter);
  }, []);

  useEffect(() => () => stopPlayback(), []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (interactionMode !== "compose" || isEditableTarget(event.target)) {
        return;
      }

      const key = normalizeKeyboardKey(event.key);

      if (key === "z" || key === "x") {
        event.preventDefault();
        const direction = key === "z" ? -1 : 1;

        setOctaveOffset((current) => {
          const next = Math.max(-2, Math.min(2, current + direction));

          if (recorderRef.current) {
            recorderRef.current = { ...recorderRef.current, octaveOffset: next };
          }

          return next;
        });
        return;
      }

      if (!isRecording || !recorderRef.current || event.repeat) {
        return;
      }

      if (midiForKeyboardKey(key, recorderRef.current.octaveOffset) === null) {
        return;
      }

      event.preventDefault();
      const result = handleMelodyKeyDown(recorderRef.current, key, performance.now());
      recorderRef.current = result.state;
      setActiveMidi(result.state.currentNote?.midi ?? null);

      if (result.previewMidi !== null) {
        playMelodyNotePreview(result.previewMidi, playbackSettings);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (!isRecording || !recorderRef.current || isEditableTarget(event.target)) {
        return;
      }

      const key = normalizeKeyboardKey(event.key);

      if (midiForKeyboardKey(key, recorderRef.current.octaveOffset) === null) {
        return;
      }

      event.preventDefault();
      recorderRef.current = handleMelodyKeyUp(recorderRef.current, key, performance.now());
      setActiveMidi(recorderRef.current.currentNote?.midi ?? null);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [interactionMode, isRecording, playbackSettings]);

  function updatePlaybackSettings(nextSettings: PlaybackSettings) {
    const shouldRevoice =
      nextSettings.register !== playbackSettings.register || nextSettings.spread !== playbackSettings.spread;

    setPlaybackSettings(nextSettings);

    if (shouldRevoice) {
      setHarmonySlots((slots) => revoiceHarmonySlots(slots, nextSettings));
    }
  }

  function handleSelectChord(chord: CircleChord) {
    setSelectedChord(chord);
    setIsPlaying(false);
    playChordPreview(chord, playbackSettings);

    if (interactionMode === "compose") {
      const result = assignChordToSelectedOrNextEmpty(
        harmonySlots,
        selectedSlotId,
        chord,
        playbackSettings,
        gridBeats
      );
      setHarmonySlots(result.slots);
      setSelectedSlotId(result.selectedSlotId);
    }
  }

  function handleSelectSlot(slot: HarmonySlot) {
    setSelectedSlotId(slot.id);

    if (slot.chordId) {
      const chord = CIRCLE_CHORDS_BY_ID.get(slot.chordId);

      if (chord) {
        setSelectedChord(chord);
        playChordPreview(chord, playbackSettings, slot.voicingMidi ?? undefined);
      }
    }
  }

  function handleRecordToggle() {
    if (isRecording && recorderRef.current) {
      const notes = finishMelodyRecording(recorderRef.current, performance.now(), playbackSettings.tempoBpm);
      recorderRef.current = null;
      setIsRecording(false);
      setActiveMidi(null);
      setMelodyNotes(notes);
      setHarmonySlots((slots) => generateHarmonyGrid(notes, slots, gridBeats));
      return;
    }

    stopPlayback();
    setIsPlaying(false);
    setInteractionMode("compose");
    setMelodyNotes([]);
    setActiveMidi(null);
    recorderRef.current = createMelodyRecorderState(performance.now(), octaveOffset);
    setIsRecording(true);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  function handlePlayToggle() {
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      return;
    }

    if (melodyNotes.length === 0 && harmonySlots.every((slot) => !slot.chordId)) {
      return;
    }

    setIsPlaying(true);
    playArrangement(melodyNotes, harmonySlots, playbackSettings, () => setIsPlaying(false));
  }

  function handleGridChange(nextGridBeats: HarmonyGridBeats) {
    setGridBeats(nextGridBeats);
    setHarmonySlots((slots) => generateHarmonyGrid(melodyNotes, slots, nextGridBeats));
    setSelectedSlotId(null);
  }

  function handleRemoveChord(slotId: string) {
    setHarmonySlots((slots) => revoiceHarmonySlots(removeHarmonySlotChord(slots, slotId), playbackSettings));
  }

  function handleMoveChord(slotId: string, direction: -1 | 1) {
    setHarmonySlots((slots) => moveHarmonySlotChord(slots, slotId, direction, playbackSettings));
  }

  function handleClearMelody() {
    setMelodyNotes([]);
    recorderRef.current = null;
    setIsRecording(false);
    setActiveMidi(null);
  }

  function handleClearHarmony() {
    setHarmonySlots((slots) => clearHarmonySlots(slots));
    setSelectedSlotId(null);
  }

  function handleClearAll() {
    stopPlayback();
    setIsPlaying(false);
    setMelodyNotes([]);
    setHarmonySlots(generateHarmonyGrid([], [], gridBeats));
    setSelectedSlotId(null);
    recorderRef.current = null;
    setIsRecording(false);
    setActiveMidi(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>Interactive Theory Map</p>
          <h1>Interactive Circle of Fifths</h1>
        </div>
        <ModeSwitch mode={interactionMode} onModeChange={setInteractionMode} />
      </header>
      <div className="workspace">
        <div className="main-stack">
          <CircleOfFifths
            selectedChord={selectedChord}
            modeChordIds={modeChordIds}
            modeChords={modeChords}
            onSelectChord={handleSelectChord}
          />
          <ArrangementTimeline
            activeMidi={activeMidi}
            gridBeats={gridBeats}
            harmonySlots={harmonySlots}
            isPlaying={isPlaying}
            isRecording={isRecording}
            melodyNotes={melodyNotes}
            modePlan={modePlan}
            octaveOffset={octaveOffset}
            onClearAll={handleClearAll}
            onClearHarmony={handleClearHarmony}
            onClearMelody={handleClearMelody}
            onGridChange={handleGridChange}
            onMoveChord={handleMoveChord}
            onPlayToggle={handlePlayToggle}
            onRecordToggle={handleRecordToggle}
            onRemoveChord={handleRemoveChord}
            onSelectSlot={handleSelectSlot}
            selectedSlotId={selectedSlotId}
          />
        </div>
        <DetailPanel
          mode={mode}
          onModeChange={setMode}
          onPlaybackSettingsChange={updatePlaybackSettings}
          onTonicChange={setTonic}
          playbackSettings={playbackSettings}
          selectedChord={selectedChord}
          tonic={tonic}
        />
      </div>
      <FooterCounter counter={visitorCounter} />
    </main>
  );
}
