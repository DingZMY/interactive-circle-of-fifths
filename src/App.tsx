import { useEffect, useMemo, useState } from "react";
import { playChordPreview, playTimeline, stopPlayback } from "./audio";
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
  type CompositionStep,
  clearComposition,
  createCompositionStep,
  loadCompositionSteps,
  moveCompositionStep,
  removeCompositionStep,
  revoiceComposition,
  saveCompositionSteps
} from "./composition";
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

type InteractionMode = "explore" | "compose";

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

function optionLabel(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
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

function CompositionTimeline({
  steps,
  selectedStepId,
  modePlan,
  isPlaying,
  onSelectStep,
  onRemoveStep,
  onMoveStep,
  onUndo,
  onClear,
  onPlayToggle
}: {
  steps: CompositionStep[];
  selectedStepId: string | null;
  modePlan: ModePlan;
  isPlaying: boolean;
  onSelectStep: (step: CompositionStep) => void;
  onRemoveStep: (id: string) => void;
  onMoveStep: (id: string, direction: -1 | 1) => void;
  onUndo: () => void;
  onClear: () => void;
  onPlayToggle: () => void;
}) {
  return (
    <section className="timeline-panel" aria-label="Composition timeline">
      <div className="timeline-header">
        <div>
          <p>Composition</p>
          <h2>{steps.length === 0 ? "No chords recorded" : `${steps.length} chords recorded`}</h2>
        </div>
        <div className="timeline-actions">
          <button disabled={steps.length === 0} onClick={onPlayToggle} type="button">
            {isPlaying ? "Stop" : "Play"}
          </button>
          <button disabled={steps.length === 0} onClick={onUndo} type="button">
            Undo
          </button>
          <button disabled={steps.length === 0} onClick={onClear} type="button">
            Clear
          </button>
        </div>
      </div>
      {steps.length === 0 ? (
        <div className="empty-timeline">Empty timeline</div>
      ) : (
        <ol className="timeline-list">
          {steps.map((step, index) => {
            const chord = CIRCLE_CHORDS_BY_ID.get(step.chordId);

            if (!chord) {
              return null;
            }

            const membership = findModeMembership(modePlan, chord);

            return (
              <li className={`timeline-step${selectedStepId === step.id ? " is-selected" : ""}`} key={step.id}>
                <button className="timeline-step-main" onClick={() => onSelectStep(step)} type="button">
                  <span className="step-color" style={{ background: chord.color }} />
                  <strong>{chord.label}</strong>
                  <small>{membership ? `${membership.roman} / degree ${membership.degree}` : "outside"}</small>
                </button>
                <div className="step-controls">
                  <button
                    aria-label={`Move ${chord.label} left`}
                    disabled={index === 0}
                    onClick={() => onMoveStep(step.id, -1)}
                    type="button"
                  >
                    {"<"}
                  </button>
                  <button
                    aria-label={`Move ${chord.label} right`}
                    disabled={index === steps.length - 1}
                    onClick={() => onMoveStep(step.id, 1)}
                    type="button"
                  >
                    {">"}
                  </button>
                  <button aria-label={`Delete ${chord.label}`} onClick={() => onRemoveStep(step.id)} type="button">
                    x
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
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

export default function App() {
  const [tonic, setTonic] = useState("C");
  const [mode, setMode] = useState<ModeName>("Ionian");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("explore");
  const [playbackSettings, setPlaybackSettings] = useState<PlaybackSettings>(() => loadPlaybackSettings());
  const [compositionSteps, setCompositionSteps] = useState<CompositionStep[]>(() =>
    loadCompositionSteps(playbackSettings)
  );
  const [selectedChord, setSelectedChord] = useState<CircleChord>(CIRCLE_CHORDS[0]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
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
    saveCompositionSteps(compositionSteps);
  }, [compositionSteps]);

  useEffect(() => () => stopPlayback(), []);

  function updatePlaybackSettings(nextSettings: PlaybackSettings) {
    const shouldRevoice =
      nextSettings.register !== playbackSettings.register || nextSettings.spread !== playbackSettings.spread;

    setPlaybackSettings(nextSettings);

    if (shouldRevoice) {
      setCompositionSteps((steps) => revoiceComposition(steps, nextSettings));
    }
  }

  function handleSelectChord(chord: CircleChord) {
    setSelectedChord(chord);
    setIsTimelinePlaying(false);

    const previousVoicing = compositionSteps[compositionSteps.length - 1]?.voicingMidi;
    const voicing = playChordPreview(chord, playbackSettings, previousVoicing);

    if (interactionMode === "compose") {
      const step = createCompositionStep(chord, voicing);
      setCompositionSteps((steps) => [...steps, step]);
      setSelectedStepId(step.id);
    } else {
      setSelectedStepId(null);
    }
  }

  function handleSelectStep(step: CompositionStep) {
    const chord = CIRCLE_CHORDS_BY_ID.get(step.chordId);

    if (!chord) {
      return;
    }

    setSelectedStepId(step.id);
    setSelectedChord(chord);
    setIsTimelinePlaying(false);
    playChordPreview(chord, playbackSettings, step.voicingMidi);
  }

  function handleRemoveStep(id: string) {
    setCompositionSteps((steps) => removeCompositionStep(steps, id));
    setSelectedStepId((current) => (current === id ? null : current));
  }

  function handleMoveStep(id: string, direction: -1 | 1) {
    setCompositionSteps((steps) => revoiceComposition(moveCompositionStep(steps, id, direction), playbackSettings));
  }

  function handleUndo() {
    setCompositionSteps((steps) => steps.slice(0, -1));
    setSelectedStepId(null);
  }

  function handleClear() {
    stopPlayback();
    setIsTimelinePlaying(false);
    setCompositionSteps(clearComposition());
    setSelectedStepId(null);
  }

  function handlePlayToggle() {
    if (isTimelinePlaying) {
      stopPlayback();
      setIsTimelinePlaying(false);
      return;
    }

    if (compositionSteps.length === 0) {
      return;
    }

    setIsTimelinePlaying(true);
    playTimeline(compositionSteps, playbackSettings, () => setIsTimelinePlaying(false));
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
          <CompositionTimeline
            isPlaying={isTimelinePlaying}
            modePlan={modePlan}
            onClear={handleClear}
            onMoveStep={handleMoveStep}
            onPlayToggle={handlePlayToggle}
            onRemoveStep={handleRemoveStep}
            onSelectStep={handleSelectStep}
            onUndo={handleUndo}
            selectedStepId={selectedStepId}
            steps={compositionSteps}
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
    </main>
  );
}
