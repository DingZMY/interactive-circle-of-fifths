import type { CircleChord } from "./circleData";
import type { CompositionStep } from "./composition";
import {
  DEFAULT_TIME_SIGNATURE,
  arrangementEndBeat,
  beatsPerBar,
  type HarmonySlot,
  type TimeSignature
} from "./arrangement";
import type { MelodyNote } from "./melody";
import type { PlaybackSettings, SoundPreset } from "./playbackSettings";
import { buildSmartVoicing, type Voicing } from "./voicing";

interface OscillatorLayer {
  type: OscillatorType;
  gain: number;
  detune: number;
}

interface PresetEngine {
  gain: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterType: BiquadFilterType;
  filterFrequency: number;
  filterQ: number;
  strum: number;
  vibratoCents: number;
  layers: OscillatorLayer[];
}

interface PlaybackHandle {
  stop: () => void;
}

export interface ChordPatternEvent {
  midi: number;
  voiceIndex: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

const PRESET_ENGINES: Record<SoundPreset, PresetEngine> = {
  "chamber-keys": {
    gain: 0.92,
    attack: 0.015,
    decay: 0.42,
    sustain: 0.34,
    release: 0.62,
    filterType: "lowpass",
    filterFrequency: 3200,
    filterQ: 0.7,
    strum: 0.018,
    vibratoCents: 2.5,
    layers: [
      { type: "triangle", gain: 0.58, detune: 0 },
      { type: "sine", gain: 0.22, detune: 7 },
      { type: "triangle", gain: 0.16, detune: -8 }
    ]
  },
  "warm-pad": {
    gain: 0.7,
    attack: 0.32,
    decay: 0.9,
    sustain: 0.72,
    release: 1.1,
    filterType: "lowpass",
    filterFrequency: 1850,
    filterQ: 0.95,
    strum: 0.028,
    vibratoCents: 6,
    layers: [
      { type: "sawtooth", gain: 0.24, detune: -9 },
      { type: "triangle", gain: 0.46, detune: 0 },
      { type: "sawtooth", gain: 0.2, detune: 11 }
    ]
  },
  "glass-pluck": {
    gain: 0.82,
    attack: 0.006,
    decay: 0.22,
    sustain: 0.18,
    release: 0.44,
    filterType: "highpass",
    filterFrequency: 360,
    filterQ: 0.5,
    strum: 0.014,
    vibratoCents: 1.5,
    layers: [
      { type: "sine", gain: 0.48, detune: 0 },
      { type: "triangle", gain: 0.28, detune: 1200 },
      { type: "sine", gain: 0.18, detune: 1902 }
    ]
  },
  "string-ensemble": {
    gain: 0.76,
    attack: 0.18,
    decay: 0.62,
    sustain: 0.64,
    release: 0.94,
    filterType: "lowpass",
    filterFrequency: 2450,
    filterQ: 0.82,
    strum: 0.022,
    vibratoCents: 8,
    layers: [
      { type: "sawtooth", gain: 0.26, detune: -13 },
      { type: "triangle", gain: 0.32, detune: 0 },
      { type: "sawtooth", gain: 0.22, detune: 13 }
    ]
  }
};

let sharedContext: AudioContext | null = null;
let currentPlayback: PlaybackHandle | null = null;

function getAudioContext(): AudioContext {
  if (sharedContext) {
    return sharedContext;
  }

  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio is not available in this browser.");
  }

  sharedContext = new AudioContextClass();
  return sharedContext;
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function clampGain(value: number): number {
  return Math.max(0.0001, value);
}

function pushPatternEvent(
  events: ChordPatternEvent[],
  slot: HarmonySlot,
  voiceIndex: number,
  offsetBeat: number,
  durationBeats: number,
  velocity: number
): void {
  if (!slot.voicingMidi) {
    return;
  }

  const startBeat = slot.startBeat + offsetBeat;
  const slotEndBeat = slot.startBeat + slot.durationBeats;
  const endBeat = Math.min(slotEndBeat, startBeat + Math.max(0.05, durationBeats));

  if (startBeat >= slotEndBeat || endBeat - startBeat < 0.035) {
    return;
  }

  events.push({
    midi: slot.voicingMidi[voiceIndex],
    voiceIndex,
    startBeat,
    durationBeats: endBeat - startBeat,
    velocity
  });
}

function pushVoiceGroup(
  events: ChordPatternEvent[],
  slot: HarmonySlot,
  voiceIndices: number[],
  offsetBeat: number,
  durationBeats: number,
  velocity: number
): void {
  for (const voiceIndex of voiceIndices) {
    pushPatternEvent(events, slot, voiceIndex, offsetBeat, durationBeats, velocity);
  }
}

function isBarStart(beat: number, timeSignature: TimeSignature): boolean {
  const barBeats = beatsPerBar(timeSignature);
  const beatInBar = ((beat % barBeats) + barBeats) % barBeats;

  return beatInBar < 0.001 || barBeats - beatInBar < 0.001;
}

export function buildChordPatternEvents(
  slot: HarmonySlot,
  settings: PlaybackSettings,
  timeSignature: TimeSignature = DEFAULT_TIME_SIGNATURE
): ChordPatternEvent[] {
  if (!slot.voicingMidi || slot.durationBeats <= 0) {
    return [];
  }

  const events: ChordPatternEvent[] = [];
  const barBeats = beatsPerBar(timeSignature);
  const motionLift = settings.motion * 0.12;

  if (settings.chordPattern === "held") {
    pushVoiceGroup(events, slot, [0, 1, 2, 3], 0, slot.durationBeats, 0.82 + motionLift);
    return events;
  }

  if (settings.chordPattern === "pulse") {
    for (let offsetBeat = 0; offsetBeat < slot.durationBeats; offsetBeat += 1) {
      const absoluteBeat = slot.startBeat + offsetBeat;
      const velocity = isBarStart(absoluteBeat, timeSignature) ? 0.88 + motionLift : 0.62 + motionLift;

      pushVoiceGroup(events, slot, [0, 1, 2, 3], offsetBeat, 0.72 + settings.motion * 0.16, velocity);
    }

    return events;
  }

  if (settings.chordPattern === "arp") {
    const order = [0, 1, 2, 3, 2, 1];
    const stepBeats = 0.5;

    for (let offsetBeat = 0, step = 0; offsetBeat < slot.durationBeats; offsetBeat += stepBeats, step += 1) {
      const voiceIndex = order[step % order.length];
      const velocity = isBarStart(slot.startBeat + offsetBeat, timeSignature)
        ? 0.84 + motionLift
        : 0.58 + motionLift + (voiceIndex === 0 ? 0.05 : 0);

      pushPatternEvent(events, slot, voiceIndex, offsetBeat, 0.42 + settings.motion * 0.12, velocity);
    }

    return events;
  }

  const brokenPattern =
    timeSignature === "3/4"
      ? [
          { offset: 0, voices: [0], duration: 1.05, velocity: 0.9 },
          { offset: 0.5, voices: [1, 2], duration: 0.62, velocity: 0.62 },
          { offset: 1.25, voices: [0, 3], duration: 0.58, velocity: 0.6 },
          { offset: 2, voices: [1, 2, 3], duration: 0.82, velocity: 0.68 }
        ]
      : [
          { offset: 0, voices: [0], duration: 1.1, velocity: 0.9 },
          { offset: 0.5, voices: [1, 2], duration: 0.66, velocity: 0.62 },
          { offset: 1.25, voices: [3], duration: 0.58, velocity: 0.58 },
          { offset: 2, voices: [0, 2], duration: 0.7, velocity: 0.62 },
          { offset: 3, voices: [1, 2, 3], duration: 0.85, velocity: 0.68 }
        ];

  for (let barOffset = 0; barOffset < slot.durationBeats; barOffset += barBeats) {
    for (const entry of brokenPattern) {
      pushVoiceGroup(
        events,
        slot,
        entry.voices,
        barOffset + entry.offset,
        entry.duration + settings.motion * 0.08,
        entry.velocity + motionLift
      );
    }
  }

  return events.sort((a, b) => a.startBeat - b.startBeat || a.voiceIndex - b.voiceIndex);
}

function createOutputChain(context: AudioContext, settings: PlaybackSettings) {
  const input = context.createGain();
  const dry = context.createGain();
  const delay = context.createDelay(1.2);
  const feedback = context.createGain();
  const wetTone = context.createBiquadFilter();
  const wet = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const master = context.createGain();
  const space = settings.reverbAmount;
  const motion = settings.motion;

  dry.gain.value = 0.9 - space * 0.24;
  delay.delayTime.value = 0.08 + motion * 0.18 + space * 0.16;
  feedback.gain.value = 0.06 + space * 0.48;
  wetTone.type = "lowpass";
  wetTone.frequency.value = 3200 - space * 1500;
  wet.gain.value = space * 0.78;
  compressor.threshold.value = -18;
  compressor.knee.value = 22;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.22;
  master.gain.value = 0.76;

  input.connect(dry);
  dry.connect(compressor);
  input.connect(delay);
  delay.connect(wetTone);
  wetTone.connect(feedback);
  feedback.connect(delay);
  wetTone.connect(wet);
  wet.connect(compressor);
  compressor.connect(master);
  master.connect(context.destination);

  return {
    input,
    disconnect: () => {
      input.disconnect();
      dry.disconnect();
      delay.disconnect();
      feedback.disconnect();
      wetTone.disconnect();
      wet.disconnect();
      compressor.disconnect();
      master.disconnect();
    }
  };
}

function scheduleVoice(
  context: AudioContext,
  destination: AudioNode,
  midi: number,
  start: number,
  duration: number,
  voiceIndex: number,
  settings: PlaybackSettings,
  velocity = 1
): AudioScheduledSourceNode[] {
  const preset = PRESET_ENGINES[settings.preset];
  const motion = settings.motion;
  const space = settings.reverbAmount;
  const voiceStart = start + voiceIndex * preset.strum * (0.45 + motion * 5.8);
  const releaseStart = Math.max(voiceStart + preset.attack + 0.02, start + duration - preset.release);
  const noteEnd = start + duration + preset.release + space * 1.45 + 0.08;
  const voiceGain = context.createGain();
  const filter = context.createBiquadFilter();
  const sources: AudioScheduledSourceNode[] = [];
  const filterStart =
    preset.filterType === "lowpass"
      ? Math.max(260, preset.filterFrequency * (0.62 + motion * 0.32))
      : preset.filterFrequency * (1 + motion * 0.18);
  const filterPeak =
    preset.filterType === "lowpass"
      ? preset.filterFrequency + motion * 3600
      : Math.max(160, preset.filterFrequency - motion * 170);
  const velocityGain = Math.max(0.18, velocity);

  voiceGain.gain.setValueAtTime(0.0001, voiceStart);
  voiceGain.gain.linearRampToValueAtTime(clampGain((preset.gain * velocityGain) / 4.8), voiceStart + preset.attack);
  voiceGain.gain.exponentialRampToValueAtTime(
    clampGain((preset.gain * preset.sustain * velocityGain) / 4.8),
    voiceStart + preset.attack + preset.decay
  );
  voiceGain.gain.setValueAtTime(clampGain((preset.gain * preset.sustain * velocityGain) / 4.8), releaseStart);
  voiceGain.gain.linearRampToValueAtTime(0.0001, start + duration + preset.release);

  filter.type = preset.filterType;
  filter.frequency.setValueAtTime(filterStart, voiceStart);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(80, filterPeak),
    voiceStart + preset.attack + Math.max(0.08, preset.decay * (0.42 + motion * 0.38))
  );
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(80, preset.filterFrequency * (0.82 + motion * 0.16)),
    start + duration
  );
  filter.Q.setValueAtTime(preset.filterQ, voiceStart);
  filter.Q.linearRampToValueAtTime(preset.filterQ + motion * 1.4, voiceStart + 0.18);
  filter.connect(voiceGain);
  voiceGain.connect(destination);

  for (const layer of preset.layers) {
    const oscillator = context.createOscillator();
    const layerGain = context.createGain();

    oscillator.type = layer.type;
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), voiceStart);
    oscillator.detune.setValueAtTime(layer.detune, voiceStart);
    oscillator.detune.linearRampToValueAtTime(
      layer.detune + (voiceIndex % 2 === 0 ? -1 : 1) * motion * 9,
      start + duration
    );
    layerGain.gain.value = layer.gain;

    if (motion > 0.01 && preset.vibratoCents > 0) {
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();

      lfo.frequency.setValueAtTime(0.35 + motion * 5.6, voiceStart);
      lfoGain.gain.setValueAtTime(motion * preset.vibratoCents * 2.4, voiceStart);
      lfo.connect(lfoGain);
      lfoGain.connect(oscillator.detune);
      lfo.start(voiceStart);
      lfo.stop(noteEnd);
      sources.push(lfo);
    }

    oscillator.connect(layerGain);
    layerGain.connect(filter);
    oscillator.start(voiceStart);
    oscillator.stop(noteEnd);
    sources.push(oscillator);
  }

  return sources;
}

function scheduleChord(
  context: AudioContext,
  destination: AudioNode,
  voicing: Voicing,
  start: number,
  duration: number,
  settings: PlaybackSettings
): AudioScheduledSourceNode[] {
  return voicing.flatMap((midi, index) => scheduleVoice(context, destination, midi, start, duration, index, settings));
}

function scheduleMelodyVoice(
  context: AudioContext,
  destination: AudioNode,
  midi: number,
  start: number,
  duration: number,
  velocity: number,
  settings: PlaybackSettings
): AudioScheduledSourceNode[] {
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const oscillator = context.createOscillator();
  const shine = context.createOscillator();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  const release = 0.16 + settings.reverbAmount * 0.32;
  const end = start + duration + release + settings.reverbAmount * 0.7;
  const peak = clampGain(0.2 * velocity);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.setValueAtTime(peak * 0.68, Math.max(start + 0.04, start + duration - release));
  gain.gain.linearRampToValueAtTime(0.0001, start + duration + release);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3200 + settings.motion * 2400, start);
  filter.Q.setValueAtTime(0.65 + settings.motion * 0.8, start);
  filter.connect(gain);
  gain.connect(destination);

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
  oscillator.detune.setValueAtTime(-2, start);

  shine.type = "sine";
  shine.frequency.setValueAtTime(midiToFrequency(midi + 12), start);
  shine.detune.setValueAtTime(3, start);

  lfo.frequency.setValueAtTime(3.2 + settings.motion * 4.2, start);
  lfoGain.gain.setValueAtTime(settings.motion * 10, start);
  lfo.connect(lfoGain);
  lfoGain.connect(oscillator.detune);

  oscillator.connect(filter);
  shine.connect(filter);
  oscillator.start(start);
  shine.start(start);
  lfo.start(start);
  oscillator.stop(end);
  shine.stop(end);
  lfo.stop(end);

  return [oscillator, shine, lfo];
}

function startPlayback(
  schedule: (context: AudioContext, destination: AudioNode, start: number) => { sources: AudioScheduledSourceNode[]; end: number },
  settings: PlaybackSettings,
  onEnded?: () => void
): void {
  stopPlayback();

  const context = getAudioContext();
  const chain = createOutputChain(context, settings);
  const start = context.currentTime + 0.035;
  const { sources, end } = schedule(context, chain.input, start);
  let stopped = false;

  void context.resume();

  const endTimer = window.setTimeout(() => {
    if (!stopped) {
      stopped = true;
      chain.disconnect();
      currentPlayback = null;
      onEnded?.();
    }
  }, Math.max(0, (end - context.currentTime) * 1000 + 120));

  currentPlayback = {
    stop: () => {
      if (stopped) {
        return;
      }

      stopped = true;
      window.clearTimeout(endTimer);

      for (const source of sources) {
        try {
          source.stop(context.currentTime + 0.04);
        } catch {
          // Already stopped.
        }
      }

      window.setTimeout(() => {
        chain.disconnect();
      }, 90);
    }
  };
}

export function stopPlayback(): void {
  currentPlayback?.stop();
  currentPlayback = null;
}

export function playChordPreview(
  chord: CircleChord,
  settings: PlaybackSettings,
  previousVoicing?: Voicing,
  timeSignature: TimeSignature = DEFAULT_TIME_SIGNATURE
): Voicing {
  const voicing = buildSmartVoicing(chord, settings, previousVoicing);

  startPlayback(
    (context, destination, start) => {
      const secondsPerBeat = 60 / settings.tempoBpm;
      const durationBeats = Math.min(2, beatsPerBar(timeSignature));
      const previewSlot: HarmonySlot = {
        id: "preview",
        startBeat: 0,
        durationBeats,
        chordId: chord.id,
        voicingMidi: voicing
      };
      const events = buildChordPatternEvents(previewSlot, settings, timeSignature);
      const sources = events.flatMap((event) =>
        scheduleVoice(
          context,
          destination,
          event.midi,
          start + event.startBeat * secondsPerBeat,
          event.durationBeats * secondsPerBeat,
          event.voiceIndex,
          settings,
          event.velocity
        )
      );
      const duration = durationBeats * secondsPerBeat;

      return {
        sources,
        end: start + duration + PRESET_ENGINES[settings.preset].release + settings.reverbAmount * 2 + 0.18
      };
    },
    settings
  );

  return voicing;
}

export function playTimeline(steps: CompositionStep[], settings: PlaybackSettings, onEnded?: () => void): void {
  const secondsPerBeat = 60 / settings.tempoBpm;

  startPlayback(
    (context, destination, start) => {
      const sources: AudioScheduledSourceNode[] = [];
      let offset = 0;

      for (const step of steps) {
        const duration = step.durationBeats * secondsPerBeat;
        sources.push(...scheduleChord(context, destination, step.voicingMidi, start + offset, duration, settings));
        offset += duration;
      }

      return {
        sources,
        end: start + offset + PRESET_ENGINES[settings.preset].release + settings.reverbAmount * 2 + 0.24
      };
    },
    settings,
    onEnded
  );
}

export function playChord(chord: CircleChord, settings: PlaybackSettings): void {
  playChordPreview(chord, settings);
}

export function playMelodyNotePreview(midi: number, settings: PlaybackSettings): void {
  startPlayback(
    (context, destination, start) => {
      const duration = 0.42;
      const sources = scheduleMelodyVoice(context, destination, midi, start, duration, 0.82, settings);

      return {
        sources,
        end: start + duration + settings.reverbAmount * 1.2 + 0.35
      };
    },
    settings
  );
}

export function playArrangement(
  melodyNotes: MelodyNote[],
  harmonySlots: HarmonySlot[],
  settings: PlaybackSettings,
  timeSignature: TimeSignature = DEFAULT_TIME_SIGNATURE,
  onEnded?: () => void
): void {
  const secondsPerBeat = 60 / settings.tempoBpm;

  startPlayback(
    (context, destination, start) => {
      const sources: AudioScheduledSourceNode[] = [];

      for (const slot of harmonySlots) {
        if (!slot.chordId || !slot.voicingMidi) {
          continue;
        }

        for (const event of buildChordPatternEvents(slot, settings, timeSignature)) {
          sources.push(
            ...scheduleVoice(
              context,
              destination,
              event.midi,
              start + event.startBeat * secondsPerBeat,
              event.durationBeats * secondsPerBeat,
              event.voiceIndex,
              settings,
              event.velocity
            )
          );
        }
      }

      for (const note of melodyNotes) {
        sources.push(
          ...scheduleMelodyVoice(
            context,
            destination,
            note.midi,
            start + note.startBeat * secondsPerBeat,
            note.durationBeats * secondsPerBeat,
            note.velocity,
            settings
          )
        );
      }

      const endBeat = arrangementEndBeat(melodyNotes, harmonySlots);

      return {
        sources,
        end: start + endBeat * secondsPerBeat + settings.reverbAmount * 2 + 0.5
      };
    },
    settings,
    onEnded
  );
}
