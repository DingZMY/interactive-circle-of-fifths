import { useMemo, useState } from "react";
import { playChord } from "./audio";
import {
  CIRCLE_CENTER,
  CIRCLE_CHORDS,
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
import { MODES, type ModeName, buildModePlan, findModeMembership } from "./modes";
import { getChordTones, qualityLabel } from "./music";

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

function DetailPanel({
  tonic,
  mode,
  selectedChord,
  onTonicChange,
  onModeChange
}: {
  tonic: string;
  mode: ModeName;
  selectedChord: CircleChord;
  onTonicChange: (tonic: string) => void;
  onModeChange: (mode: ModeName) => void;
}) {
  const modePlan = useMemo(() => buildModePlan(tonic, mode), [mode, tonic]);
  const membership = findModeMembership(modePlan, selectedChord);
  const selectedTones = getChordTones(selectedChord.rootLabel, selectedChord.quality).map((tone) => tone.label);

  return (
    <aside className="detail-panel">
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
  const [selectedChord, setSelectedChord] = useState<CircleChord>(CIRCLE_CHORDS[0]);
  const modePlan = useMemo(() => buildModePlan(tonic, mode), [mode, tonic]);
  const modeChordIds = useMemo(
    () => new Set(modePlan.chords.map((chord) => chord.circleChord.id)),
    [modePlan]
  );
  const modeChords = useMemo(() => modePlan.chords.map((chord) => chord.circleChord), [modePlan]);

  function handleSelectChord(chord: CircleChord) {
    setSelectedChord(chord);
    playChord(chord);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>Interactive Theory Map</p>
          <h1>Interactive Circle of Fifths</h1>
        </div>
      </header>
      <div className="workspace">
        <CircleOfFifths
          selectedChord={selectedChord}
          modeChordIds={modeChordIds}
          modeChords={modeChords}
          onSelectChord={handleSelectChord}
        />
        <DetailPanel
          tonic={tonic}
          mode={mode}
          selectedChord={selectedChord}
          onTonicChange={setTonic}
          onModeChange={setMode}
        />
      </div>
    </main>
  );
}
