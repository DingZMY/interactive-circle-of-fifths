import type { CircleChord } from "./circleData";
import { QUALITY_INTERVALS } from "./music";

let sharedContext: AudioContext | null = null;
let stopPrevious: (() => void) | null = null;

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

function midiForChordTone(rootPitchClass: number, interval: number): number {
  let midi = 48 + rootPitchClass + interval;

  while (midi < 52) {
    midi += 12;
  }

  return midi;
}

export function playChord(chord: CircleChord): void {
  stopPrevious?.();

  const context = getAudioContext();
  const start = context.currentTime + 0.025;
  const duration = 1.25;
  const filter = context.createBiquadFilter();
  const master = context.createGain();
  const oscillators: OscillatorNode[] = [];
  let disconnected = false;

  void context.resume();

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, start);
  filter.Q.setValueAtTime(0.55, start);
  master.gain.setValueAtTime(0.0001, start);
  master.gain.linearRampToValueAtTime(0.72, start + 0.035);
  master.gain.exponentialRampToValueAtTime(0.28, start + 0.42);
  master.gain.linearRampToValueAtTime(0.0001, start + duration);

  filter.connect(master);
  master.connect(context.destination);

  QUALITY_INTERVALS[chord.quality].forEach((interval, index) => {
    const midi = midiForChordTone(chord.rootPitchClass, interval);
    const frequency = midiToFrequency(midi);
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const second = context.createOscillator();

    oscillator.type = index === 0 ? "triangle" : "sine";
    second.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    second.frequency.setValueAtTime(frequency, start);
    second.detune.setValueAtTime(index === 0 ? -5 : 4, start);
    gain.gain.setValueAtTime(index === 0 ? 0.26 : 0.2, start);

    oscillator.connect(gain);
    second.connect(gain);
    gain.connect(filter);
    oscillator.start(start + index * 0.018);
    second.start(start + index * 0.018);
    oscillator.stop(start + duration + 0.06);
    second.stop(start + duration + 0.06);
    oscillators.push(oscillator, second);
  });

  function disconnect() {
    if (disconnected) {
      return;
    }

    disconnected = true;
    filter.disconnect();
    master.disconnect();
  }

  const disconnectTimer = window.setTimeout(disconnect, duration * 1000 + 140);

  stopPrevious = () => {
    window.clearTimeout(disconnectTimer);
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(master.gain.value, context.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, context.currentTime + 0.04);

    for (const oscillator of oscillators) {
      try {
        oscillator.stop(context.currentTime + 0.05);
      } catch {
        // Already stopped.
      }
    }

    window.setTimeout(disconnect, 80);
  };
}
