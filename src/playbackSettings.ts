export type SoundPreset = "chamber-keys" | "warm-pad" | "glass-pluck" | "string-ensemble";
export type RegisterSetting = "low" | "mid" | "high";
export type SpreadSetting = "compact" | "open" | "wide";
export type ChordPattern = "held" | "pulse" | "broken" | "arp";

export interface PlaybackSettings {
  preset: SoundPreset;
  tempoBpm: number;
  register: RegisterSetting;
  spread: SpreadSetting;
  chordPattern: ChordPattern;
  motion: number;
  reverbAmount: number;
}

export interface SoundPresetOption {
  id: SoundPreset;
  label: string;
}

export interface ChordPatternOption {
  id: ChordPattern;
  label: string;
}

export const SOUND_PRESETS: SoundPresetOption[] = [
  { id: "chamber-keys", label: "Chamber Keys" },
  { id: "warm-pad", label: "Warm Pad" },
  { id: "glass-pluck", label: "Glass Pluck" },
  { id: "string-ensemble", label: "String Ensemble" }
];

export const CHORD_PATTERN_OPTIONS: ChordPatternOption[] = [
  { id: "held", label: "Held" },
  { id: "pulse", label: "Pulse" },
  { id: "broken", label: "Broken" },
  { id: "arp", label: "Arp" }
];

export const REGISTER_OPTIONS: RegisterSetting[] = ["low", "mid", "high"];
export const SPREAD_OPTIONS: SpreadSetting[] = ["compact", "open", "wide"];

export const SETTINGS_STORAGE_KEY = "interactive-circle-of-fifths.playback-settings.v1";

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  preset: "chamber-keys",
  tempoBpm: 88,
  register: "mid",
  spread: "open",
  chordPattern: "broken",
  motion: 0.38,
  reverbAmount: 0.34
};

function isSoundPreset(value: unknown): value is SoundPreset {
  return SOUND_PRESETS.some((preset) => preset.id === value);
}

function isRegister(value: unknown): value is RegisterSetting {
  return REGISTER_OPTIONS.includes(value as RegisterSetting);
}

function isSpread(value: unknown): value is SpreadSetting {
  return SPREAD_OPTIONS.includes(value as SpreadSetting);
}

function isChordPattern(value: unknown): value is ChordPattern {
  return CHORD_PATTERN_OPTIONS.some((option) => option.id === value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizePlaybackSettings(value: unknown): PlaybackSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_PLAYBACK_SETTINGS;
  }

  const candidate = value as Partial<PlaybackSettings>;

  return {
    preset: isSoundPreset(candidate.preset) ? candidate.preset : DEFAULT_PLAYBACK_SETTINGS.preset,
    tempoBpm:
      typeof candidate.tempoBpm === "number"
        ? Math.round(clamp(candidate.tempoBpm, 52, 140))
        : DEFAULT_PLAYBACK_SETTINGS.tempoBpm,
    register: isRegister(candidate.register) ? candidate.register : DEFAULT_PLAYBACK_SETTINGS.register,
    spread: isSpread(candidate.spread) ? candidate.spread : DEFAULT_PLAYBACK_SETTINGS.spread,
    chordPattern: isChordPattern(candidate.chordPattern)
      ? candidate.chordPattern
      : DEFAULT_PLAYBACK_SETTINGS.chordPattern,
    motion:
      typeof candidate.motion === "number"
        ? clamp(candidate.motion, 0, 1)
        : DEFAULT_PLAYBACK_SETTINGS.motion,
    reverbAmount:
      typeof candidate.reverbAmount === "number"
        ? clamp(candidate.reverbAmount, 0, 1)
        : DEFAULT_PLAYBACK_SETTINGS.reverbAmount
  };
}

export function loadPlaybackSettings(): PlaybackSettings {
  if (typeof window === "undefined") {
    return DEFAULT_PLAYBACK_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? sanitizePlaybackSettings(JSON.parse(raw)) : DEFAULT_PLAYBACK_SETTINGS;
  } catch {
    return DEFAULT_PLAYBACK_SETTINGS;
  }
}

export function savePlaybackSettings(settings: PlaybackSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
