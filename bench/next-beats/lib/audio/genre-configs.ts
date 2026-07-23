/**
 * Genre-specific music generation configs.
 *
 * Each genre defines a tempo, chord progression, melody scale, bass pattern,
 * and optional drum patterns. The music engine uses these to procedurally
 * generate unique-sounding tracks per genre.
 */

export type DrumHit = 'kick' | 'snare' | 'hihat' | 'clap';

export type DrumPattern = {
  /** Steps per bar (e.g. 16 for 16th notes) */
  steps: number;
  /** Which steps each drum hits on (0-indexed) */
  pattern: Record<DrumHit, number[]>;
};

export type GenreConfig = {
  /** Beats per minute */
  bpm: number;
  /** Chord progression as arrays of frequencies, cycled per bar */
  chords: number[][];
  /** Scale frequencies for melody generation */
  melodyNotes: number[];
  /** Melody rhythm: which 16th-note steps get a note (0–15) */
  melodyRhythm: number[];
  /** Oscillator type for melody */
  melodyWave: OscillatorType;
  /** Melody volume (0–1) */
  melodyGain: number;
  /** Bass note pattern: indices into the chord root notes */
  bassPattern: number[];
  /** Bass oscillator type */
  bassWave: OscillatorType;
  /** Bass volume (0–1) */
  bassGain: number;
  /** Pad/chord oscillator type */
  padWave: OscillatorType;
  /** Pad volume (0–1) */
  padGain: number;
  /** Pad filter cutoff frequency */
  padFilter: number;
  /** Whether to arpeggiate chords instead of sustaining */
  arpeggiate: boolean;
  /** Arpeggio speed in 16th note subdivisions (1 = every 16th) */
  arpSpeed: number;
  /** Drum pattern (optional) */
  drums?: DrumPattern;
  /** Master reverb amount 0–1 */
  reverb: number;
};

// C minor pentatonic across octaves
const cMinPent = [261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 622.25];
// G minor pentatonic
const gMinPent = [196.0, 233.08, 261.63, 293.66, 349.23, 392.0, 466.16];
// A minor pentatonic
const aMinPent = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
// D minor scale
const dMinScale = [293.66, 329.63, 349.23, 392.0, 440.0, 466.16, 523.25, 587.33];
// F major pentatonic
const fMajPent = [174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0];
// Bb major scale (jazz)
const bbMajScale = [233.08, 261.63, 293.66, 311.13, 349.23, 392.0, 440.0, 466.16];

export const genreConfigs: Record<string, GenreConfig> = {
  electronic: {
    bpm: 128,
    chords: [
      [261.63, 311.13, 392.0], // Cm
      [233.08, 293.66, 349.23], // Bb
      [220.0, 261.63, 329.63], // Am
      [246.94, 311.13, 369.99], // Bm
    ],
    melodyNotes: cMinPent,
    melodyRhythm: [0, 3, 4, 6, 8, 10, 12, 14],
    melodyWave: 'square',
    melodyGain: 0.08,
    bassPattern: [0, 0, 2, 2],
    bassWave: 'sawtooth',
    bassGain: 0.12,
    padWave: 'sine',
    padGain: 0.04,
    padFilter: 1500,
    arpeggiate: true,
    arpSpeed: 2,
    drums: {
      steps: 16,
      pattern: {
        kick: [0, 4, 8, 12],
        snare: [4, 12],
        hihat: [0, 2, 4, 6, 8, 10, 12, 14],
        clap: [4, 12],
      },
    },
    reverb: 0.3,
  },

  indie: {
    bpm: 110,
    chords: [
      [196.0, 246.94, 293.66], // G
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
      [261.63, 329.63, 392.0], // C
    ],
    melodyNotes: gMinPent,
    melodyRhythm: [0, 4, 6, 8, 12],
    melodyWave: 'triangle',
    melodyGain: 0.1,
    bassPattern: [0, 0, 2, 3],
    bassWave: 'triangle',
    bassGain: 0.1,
    padWave: 'triangle',
    padGain: 0.05,
    padFilter: 2500,
    arpeggiate: false,
    arpSpeed: 4,
    drums: {
      steps: 16,
      pattern: {
        kick: [0, 8],
        snare: [4, 12],
        hihat: [0, 4, 8, 12],
        clap: [],
      },
    },
    reverb: 0.5,
  },

  'hip-hop': {
    bpm: 90,
    chords: [
      [130.81, 155.56, 196.0], // Cm (low)
      [116.54, 146.83, 174.61], // Bb (low)
      [123.47, 155.56, 185.0], // B (low)
      [110.0, 138.59, 164.81], // A (low)
    ],
    melodyNotes: cMinPent,
    melodyRhythm: [0, 3, 6, 8, 11, 14],
    melodyWave: 'sine',
    melodyGain: 0.09,
    bassPattern: [0, 0, 1, 3],
    bassWave: 'sine',
    bassGain: 0.15,
    padWave: 'sine',
    padGain: 0.04,
    padFilter: 1000,
    arpeggiate: false,
    arpSpeed: 4,
    drums: {
      steps: 16,
      pattern: {
        kick: [0, 5, 8, 13],
        snare: [4, 12],
        hihat: [0, 2, 4, 6, 8, 10, 12, 14],
        clap: [4, 12],
      },
    },
    reverb: 0.2,
  },

  pop: {
    bpm: 120,
    chords: [
      [261.63, 329.63, 392.0], // C
      [196.0, 246.94, 293.66], // G
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
    ],
    melodyNotes: aMinPent,
    melodyRhythm: [0, 2, 4, 8, 10, 12],
    melodyWave: 'sine',
    melodyGain: 0.1,
    bassPattern: [0, 1, 2, 3],
    bassWave: 'triangle',
    bassGain: 0.1,
    padWave: 'sine',
    padGain: 0.05,
    padFilter: 3000,
    arpeggiate: false,
    arpSpeed: 4,
    drums: {
      steps: 16,
      pattern: {
        kick: [0, 4, 8, 12],
        snare: [4, 12],
        hihat: [0, 2, 4, 6, 8, 10, 12, 14],
        clap: [],
      },
    },
    reverb: 0.3,
  },

  'lo-fi': {
    bpm: 78,
    chords: [
      [196.0, 246.94, 293.66, 369.99], // Gmaj7
      [220.0, 261.63, 329.63, 392.0], // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [261.63, 329.63, 392.0, 466.16], // Cmaj7
    ],
    melodyNotes: fMajPent,
    melodyRhythm: [0, 4, 8, 12],
    melodyWave: 'triangle',
    melodyGain: 0.08,
    bassPattern: [0, 1, 2, 3],
    bassWave: 'sine',
    bassGain: 0.1,
    padWave: 'triangle',
    padGain: 0.04,
    padFilter: 1600,
    arpeggiate: false,
    arpSpeed: 4,
    drums: {
      steps: 16,
      pattern: {
        kick: [0, 8],
        snare: [4, 12],
        hihat: [0, 4, 6, 8, 12, 14],
        clap: [],
      },
    },
    reverb: 0.55,
  },

  synthwave: {
    bpm: 110,
    chords: [
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // Fm
      [261.63, 329.63, 392.0], // C
      [196.0, 246.94, 293.66], // G
    ],
    melodyNotes: aMinPent,
    melodyRhythm: [0, 2, 4, 8, 10, 12, 14],
    melodyWave: 'sawtooth',
    melodyGain: 0.07,
    bassPattern: [0, 0, 2, 3],
    bassWave: 'sawtooth',
    bassGain: 0.12,
    padWave: 'sawtooth',
    padGain: 0.04,
    padFilter: 2200,
    arpeggiate: true,
    arpSpeed: 2,
    drums: {
      steps: 16,
      pattern: {
        kick: [0, 4, 8, 12],
        snare: [4, 12],
        hihat: [0, 2, 4, 6, 8, 10, 12, 14],
        clap: [4, 12],
      },
    },
    reverb: 0.35,
  },
};

export const defaultGenreConfig = genreConfigs.pop;
