/**
 * Per-track musical profiles.
 *
 * Each track gets unique overrides for BPM, chords, melody, rhythm,
 * and waveforms so it sounds distinct and matches its title/vibe.
 * Fields are optional — anything not set falls back to the genre default.
 */

import type { GenreConfig } from './genre-configs';

export type TrackProfile = Partial<
  Pick<
    GenreConfig,
    | 'bpm'
    | 'chords'
    | 'melodyNotes'
    | 'melodyRhythm'
    | 'melodyWave'
    | 'melodyGain'
    | 'bassWave'
    | 'bassGain'
    | 'padWave'
    | 'padGain'
    | 'padFilter'
    | 'arpeggiate'
    | 'arpSpeed'
    | 'reverb'
  >
>;

// Note frequencies for building custom progressions
const C3 = 130.81,
  D3 = 146.83,
  Eb3 = 155.56,
  E3 = 164.81,
  F3 = 174.61,
  G3 = 196.0,
  Ab3 = 207.65,
  A3 = 220.0,
  Bb3 = 233.08,
  B3 = 246.94;
const C4 = 261.63,
  D4 = 293.66,
  Eb4 = 311.13,
  E4 = 329.63,
  F4 = 349.23,
  G4 = 392.0,
  Ab4 = 415.3,
  A4 = 440.0,
  Bb4 = 466.16,
  B4 = 493.88;
const C5 = 523.25,
  D5 = 587.33,
  E5 = 659.25,
  F5 = 698.46,
  G5 = 783.99;

export const trackProfiles: Record<string, TrackProfile> = {
  // ── Electronic ──

  // t1: Async Await — pulsing anticipation, then release. Catchy arp buildup.
  t1: {
    bpm: 126,
    chords: [
      [C4, E4, G4],
      [A3, C4, E4],
      [F3, A3, C4],
      [G3, B3, D4],
    ],
    melodyNotes: [E4, G4, A4, B4, C5, D5, E5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    arpeggiate: true,
    arpSpeed: 2,
    padFilter: 2400,
    reverb: 0.3,
  },

  // t2: WebSocket Sunset — warm flowing melody, like data streaming into golden hour
  t2: {
    bpm: 120,
    chords: [
      [F3, A3, C4, E4],
      [C4, E4, G4],
      [G3, B3, D4, F4],
      [A3, C4, E4],
    ],
    melodyNotes: [A4, C5, D5, E5, G5, A4],
    melodyRhythm: [0, 2, 4, 8, 10, 12],
    melodyWave: 'sine',
    padGain: 0.06,
    padFilter: 2800,
    reverb: 0.4,
  },

  // t3: Server Sent Vibes — energetic, driving, non-stop delivery
  t3: {
    bpm: 134,
    chords: [
      [C4, E4, G4],
      [Bb3, D4, F4],
      [Ab3, C4, Eb4],
      [G3, B3, D4],
    ],
    melodyNotes: [C4, E4, F4, G4, Bb4, C5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    arpeggiate: true,
    arpSpeed: 2,
    padFilter: 2200,
    reverb: 0.25,
  },

  // t4: Hydration — smooth liquid layers, everything clicking into place
  t4: {
    bpm: 122,
    chords: [
      [D4, F4, A4],
      [Bb3, D4, F4],
      [C4, E4, G4],
      [A3, C4, E4],
    ],
    melodyNotes: [D4, F4, A4, C5, D5, F5],
    melodyRhythm: [0, 2, 4, 8, 10, 12, 14],
    melodyWave: 'sine',
    padGain: 0.05,
    padFilter: 2600,
    reverb: 0.35,
  },

  // t5: Hot Module Reload — fast, urgent, snappy square wave energy
  t5: {
    bpm: 140,
    chords: [
      [E3, G3, B3],
      [A3, C4, E4],
      [D4, F4, A4],
      [G3, B3, D4],
    ],
    melodyNotes: [E4, G4, A4, B4, D5, E5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    melodyWave: 'square',
    melodyGain: 0.09,
    arpeggiate: true,
    arpSpeed: 2,
    padFilter: 2400,
    reverb: 0.2,
  },

  // ── Indie ──

  // t6: Localhost Morning — bright acoustic feel, coffee and code
  t6: {
    bpm: 112,
    chords: [
      [G3, B3, D4],
      [C4, E4, G4],
      [D4, F4, A4],
      [E3, G3, B3],
    ],
    melodyNotes: [B4, D5, E5, G5, A4, B4],
    melodyRhythm: [0, 2, 4, 8, 10, 12],
    melodyWave: 'triangle',
    melodyGain: 0.11,
    padFilter: 3200,
    reverb: 0.4,
  },

  // t7: README Love Letter — sweet picking pattern, heartfelt
  t7: {
    bpm: 108,
    chords: [
      [C4, E4, G4],
      [A3, C4, E4],
      [F3, A3, C4],
      [G3, B3, D4],
    ],
    melodyNotes: [E4, G4, A4, B4, C5, D5, E5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12],
    melodyWave: 'triangle',
    melodyGain: 0.12,
    padFilter: 3000,
    reverb: 0.4,
  },

  // t8: Open Source Crush — upbeat, hopeful, bouncy strumming feel
  t8: {
    bpm: 118,
    chords: [
      [D4, F4, A4],
      [G3, B3, D4],
      [C4, E4, G4],
      [A3, C4, E4],
    ],
    melodyNotes: [D4, F4, G4, A4, C5, D5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    padFilter: 2800,
    reverb: 0.35,
  },

  // t9: Sunday Deploy — easygoing, sun through the window
  t9: {
    bpm: 104,
    chords: [
      [G3, B3, D4, F4],
      [C4, E4, G4],
      [A3, C4, E4],
      [D4, F4, A4],
    ],
    melodyNotes: [B3, D4, E4, G4, A4, B4],
    melodyRhythm: [0, 4, 6, 8, 12, 14],
    melodyWave: 'triangle',
    padGain: 0.06,
    padFilter: 2600,
    reverb: 0.45,
  },

  // t10: npm install feelings — quirky, bouncy, playful staccato
  t10: {
    bpm: 116,
    chords: [
      [A3, C4, E4],
      [D4, F4, A4],
      [G3, B3, D4],
      [F3, A3, C4],
    ],
    melodyNotes: [A4, C5, D5, E5, G5, A4],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    melodyWave: 'triangle',
    padFilter: 3400,
    reverb: 0.25,
  },

  // ── Hip-Hop ──

  // t11: Ship It — confident swagger, head-nodding groove
  t11: {
    bpm: 94,
    chords: [
      [C3, E3, G3],
      [A3, C4, E4],
      [F3, A3, C4],
      [G3, B3, D4],
    ],
    melodyNotes: [C4, E4, G4, A4, C5],
    melodyRhythm: [0, 2, 4, 8, 10, 12, 14],
    melodyGain: 0.1,
    bassGain: 0.16,
    padFilter: 1400,
    reverb: 0.2,
  },

  // t12: Stack Overflow Flow — smooth, clever wordplay groove
  t12: {
    bpm: 90,
    chords: [
      [D3, F3, A3],
      [G3, B3, D4],
      [C3, E3, G3],
      [A3, C4, E4],
    ],
    melodyNotes: [D4, F4, G4, A4, C5, D5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12],
    padFilter: 1200,
    reverb: 0.25,
  },

  // t13: 3 AM Push — dark but catchy, night drive energy
  t13: {
    bpm: 88,
    chords: [
      [A3, C4, E4],
      [F3, A3, C4],
      [G3, B3, D4],
      [E3, G3, B3],
    ],
    melodyNotes: [A4, C5, D5, E5, G5],
    melodyRhythm: [0, 2, 4, 8, 10, 14],
    melodyGain: 0.09,
    bassGain: 0.18,
    padFilter: 1100,
    reverb: 0.3,
  },

  // t14: Merge Conflict — tense, rhythmic, two forces colliding
  t14: {
    bpm: 96,
    chords: [
      [Eb3, G3, Bb3],
      [C3, E3, G3],
      [Ab3, C4, Eb4],
      [Bb3, D4, F4],
    ],
    melodyNotes: [Eb4, F4, G4, Bb4, C5, Eb4],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    bassGain: 0.15,
    padFilter: 1300,
    reverb: 0.15,
  },

  // t15: git push --force — bold, no hesitation, full send
  t15: {
    bpm: 100,
    chords: [
      [G3, B3, D4],
      [E3, G3, B3],
      [A3, C4, E4],
      [D3, F3, A3],
    ],
    melodyNotes: [G4, A4, B4, D5, E5, G5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    melodyGain: 0.1,
    bassGain: 0.16,
    padFilter: 1400,
    reverb: 0.15,
  },

  // ── Pop ──

  // t16: Pixel Perfect — bright, precise, satisfying
  t16: {
    bpm: 122,
    chords: [
      [C4, E4, G4],
      [G3, B3, D4],
      [A3, C4, E4],
      [F3, A3, C4],
    ],
    melodyNotes: [E4, G4, A4, B4, C5, D5, E5],
    melodyRhythm: [0, 2, 4, 8, 10, 12],
    melodyWave: 'sine',
    padFilter: 3500,
    reverb: 0.3,
  },

  // t17: Tailwind Hearts — catchy, feel-good, danceable
  t17: {
    bpm: 126,
    chords: [
      [D4, F4, A4],
      [G3, B3, D4],
      [C4, E4, G4],
      [A3, C4, E4],
    ],
    melodyNotes: [D4, E4, F4, A4, B4, D5],
    melodyRhythm: [0, 2, 4, 6, 8, 12, 14],
    padFilter: 3200,
    reverb: 0.25,
  },

  // t18: Component Chemistry — bubbly, playful, spark between elements
  t18: {
    bpm: 118,
    chords: [
      [A3, C4, E4],
      [F3, A3, C4],
      [G3, B3, D4],
      [E3, G3, B3],
    ],
    melodyNotes: [C4, E4, F4, G4, A4, C5],
    melodyRhythm: [0, 3, 4, 8, 11, 12],
    padFilter: 3000,
    reverb: 0.3,
  },

  // t19: Type Safe Love — sweet, reassuring, warm
  t19: {
    bpm: 110,
    chords: [
      [F3, A3, C4, E4],
      [C4, E4, G4],
      [D4, F4, A4],
      [G3, B3, D4],
    ],
    melodyNotes: [A4, C5, D5, E5, G5],
    melodyRhythm: [0, 4, 6, 8, 12],
    melodyWave: 'sine',
    melodyGain: 0.12,
    padFilter: 3800,
    reverb: 0.35,
  },

  // t20: First Contentful Paint — uplifting, the moment it all appears
  t20: {
    bpm: 128,
    chords: [
      [C4, E4, G4, B4],
      [F3, A3, C4],
      [G3, B3, D4],
      [A3, C4, E4],
    ],
    melodyNotes: [E4, G4, B4, C5, D5, E5],
    melodyRhythm: [0, 2, 4, 8, 10, 12, 14],
    padFilter: 4000,
    reverb: 0.2,
  },

  // ── Lo-fi ──

  // t21: Slow Build — warm layers stacking, patient groove
  t21: {
    bpm: 82,
    chords: [
      [G3, B3, D4, F4],
      [C4, E4, G4],
      [A3, C4, E4],
      [D4, F4, A4],
    ],
    melodyNotes: [B4, D5, E5, G5, A4, B4],
    melodyRhythm: [0, 4, 6, 8, 12, 14],
    melodyWave: 'triangle',
    melodyGain: 0.09,
    padFilter: 1800,
    reverb: 0.5,
  },

  // t22: Console Calm — steady, meditative, watching logs scroll peacefully
  t22: {
    bpm: 78,
    chords: [
      [C4, E4, G4, B4],
      [A3, C4, E4],
      [F3, A3, C4, E4],
      [G3, B3, D4],
    ],
    melodyNotes: [E4, G4, A4, B4, D5, E5],
    melodyRhythm: [0, 4, 8, 10, 12],
    melodyWave: 'triangle',
    melodyGain: 0.08,
    padFilter: 1600,
    reverb: 0.55,
  },

  // t23: Soft Reset — gentle restart, like a fresh terminal
  t23: {
    bpm: 84,
    chords: [
      [D4, F4, A4],
      [G3, B3, D4],
      [C4, E4, G4],
      [A3, C4, E4],
    ],
    melodyNotes: [D4, F4, G4, A4, C5, D5],
    melodyRhythm: [0, 2, 4, 8, 10, 12],
    padFilter: 2000,
    reverb: 0.5,
  },

  // t24: Idle Thread — floating, peaceful, nothing to process
  t24: {
    bpm: 74,
    chords: [
      [F3, A3, C4, E4],
      [C4, E4, G4],
      [G3, B3, D4],
      [D4, F4, A4],
    ],
    melodyNotes: [A4, C5, D5, E5, G5],
    melodyRhythm: [0, 4, 8, 12, 14],
    melodyWave: 'sine',
    melodyGain: 0.08,
    padFilter: 1400,
    reverb: 0.6,
  },

  // t25: npm install sleep — drowsy, cozy, winding down but melodic
  t25: {
    bpm: 72,
    chords: [
      [G3, B3, D4, F4],
      [C4, E4, G4],
      [A3, C4, E4],
      [F3, A3, C4],
    ],
    melodyNotes: [B4, D5, E5, G5, A4],
    melodyRhythm: [0, 4, 6, 8, 12],
    melodyWave: 'triangle',
    melodyGain: 0.07,
    padFilter: 1200,
    reverb: 0.6,
  },

  // ── Synthwave ──

  // t26: Neon Terminal — glowing arpeggios, retro-futuristic energy
  t26: {
    bpm: 118,
    chords: [
      [A3, C4, E4],
      [F3, A3, C4],
      [G3, B3, D4],
      [E3, G3, B3],
    ],
    melodyNotes: [A4, C5, D5, E5, G5, A4],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    melodyWave: 'sawtooth',
    melodyGain: 0.09,
    arpeggiate: true,
    arpSpeed: 2,
    padFilter: 2800,
    reverb: 0.3,
  },

  // t27: Retro Compiler — precise, mechanical, 80s computer vibe with groove
  t27: {
    bpm: 124,
    chords: [
      [D3, F3, A3],
      [G3, B3, D4],
      [C4, E4, G4],
      [A3, C4, E4],
    ],
    melodyNotes: [D4, F4, G4, A4, C5, D5, F5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    melodyWave: 'square',
    melodyGain: 0.08,
    arpeggiate: true,
    arpSpeed: 2,
    padFilter: 2400,
    reverb: 0.25,
  },

  // t28: Cyber Monday — driving commercial synth energy
  t28: {
    bpm: 128,
    chords: [
      [E3, G3, B3],
      [C3, E3, G3],
      [A3, C4, E4],
      [D3, F3, A3],
    ],
    melodyNotes: [E4, G4, A4, B4, D5, E5],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    melodyWave: 'sawtooth',
    bassWave: 'sawtooth',
    bassGain: 0.14,
    padFilter: 3000,
    reverb: 0.2,
  },

  // t29: Chrome Dreams — shimmering, wide, nostalgic pads with melody
  t29: {
    bpm: 110,
    chords: [
      [C4, E4, G4, B4],
      [A3, C4, E4, G4],
      [F3, A3, C4, E4],
      [G3, B3, D4],
    ],
    melodyNotes: [E4, G4, B4, C5, D5, E5],
    melodyRhythm: [0, 2, 4, 8, 10, 12],
    melodyWave: 'sawtooth',
    melodyGain: 0.08,
    padWave: 'sawtooth',
    padGain: 0.05,
    padFilter: 3200,
    reverb: 0.4,
  },

  // t30: Midnight Deploy — dark urgency, pushing to production, full send
  t30: {
    bpm: 126,
    chords: [
      [A3, C4, E4],
      [F3, A3, C4],
      [E3, G3, B3],
      [G3, B3, D4],
    ],
    melodyNotes: [A4, C5, D5, E5, G5, A4],
    melodyRhythm: [0, 2, 4, 6, 8, 10, 12, 14],
    melodyWave: 'sawtooth',
    bassWave: 'sawtooth',
    bassGain: 0.13,
    padFilter: 2600,
    reverb: 0.2,
  },
};
