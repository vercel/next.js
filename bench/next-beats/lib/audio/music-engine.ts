/**
 * Procedural music engine using Web Audio API.
 *
 * Generates genre-appropriate music with melody, bass, pad, and drums.
 * Each track gets a deterministic-ish arrangement based on its ID
 * so the same track sounds consistent across plays but different tracks
 * within a genre still sound distinct.
 */

import { genreConfigs, defaultGenreConfig } from './genre-configs';
import { trackProfiles } from './track-profiles';
import type { GenreConfig, DrumHit } from './genre-configs';

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext();
  }
  if (sharedCtx.state === 'suspended') sharedCtx.resume();
  return sharedCtx;
}

export function resetAudioContext(): AudioContext {
  if (sharedCtx) {
    sharedCtx.close().catch(() => {});
  }
  sharedCtx = new AudioContext();
  return sharedCtx;
}

export function suspendAudio() {
  if (sharedCtx) sharedCtx.suspend();
}

export function resumeAudio() {
  if (sharedCtx) sharedCtx.resume();
}

/** Kill all audio by closing the context. Next getAudioContext() creates a fresh one. */
export function killAudio() {
  if (sharedCtx) {
    try {
      sharedCtx.destination.disconnect();
    } catch {}
    sharedCtx.close().catch(() => {});
    sharedCtx = null;
  }
}

/** Simple seeded PRNG for deterministic track variations */
function seededRandom(seed: number) {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 16807 + 12345) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}

/** Hash a string to a number for seeding — uses FNV-1a for better distribution */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickSeeded<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function getTrackConfig(trackId: string, genre: string): GenreConfig {
  const base = genreConfigs[genre] ?? defaultGenreConfig;
  const profile = trackProfiles[trackId];
  return profile ? { ...base, ...profile } : base;
}

function getBpmForConfig(config: GenreConfig, rand: () => number): number {
  // Tempo: ±5% variation (subtle, keeps the groove tight)
  const tempoMult = 0.95 + rand() * 0.1;
  return Math.round(config.bpm * tempoMult);
}

export function getSecondsPerBar(trackId: string, genre: string): number {
  const config = getTrackConfig(trackId, genre);
  const profileRand = seededRandom(hashString(trackId));
  const bpm = getBpmForConfig(config, profileRand);
  return (60 / bpm) * 4;
}

/** Create a convolver reverb node */
function createReverb(ctx: AudioContext, amount: number): ConvolverNode {
  const convolver = ctx.createConvolver();
  const rate = ctx.sampleRate;
  const length = rate * 2;
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2 + (1 - amount) * 3);
    }
  }
  convolver.buffer = buffer;
  return convolver;
}

/** Synthesize a drum hit */
function scheduleDrum(ctx: AudioContext, dest: AudioNode, hit: DrumHit, time: number, volume: number) {
  const v = volume * 0.4;

  if (hit === 'kick') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    gain.gain.setValueAtTime(v, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain).connect(dest);
    osc.start(time);
    osc.stop(time + 0.3);
  } else if (hit === 'snare') {
    // Noise burst + tone
    const bufSize = ctx.sampleRate * 0.1;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(v * 0.6, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    noise.connect(filter).connect(noiseGain).connect(dest);
    noise.start(time);
    noise.stop(time + 0.1);
    // Body tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.05);
    gain.gain.setValueAtTime(v * 0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(gain).connect(dest);
    osc.start(time);
    osc.stop(time + 0.08);
  } else if (hit === 'hihat') {
    const bufSize = ctx.sampleRate * 0.05;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(v * 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    noise.connect(filter).connect(gain).connect(dest);
    noise.start(time);
    noise.stop(time + 0.05);
  } else if (hit === 'clap') {
    const bufSize = ctx.sampleRate * 0.08;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(v * 0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 1;
    noise.connect(filter).connect(gain).connect(dest);
    noise.start(time);
    noise.stop(time + 0.08);
  }
}

export type ScheduledNodes = {
  stopAll: (immediate?: boolean) => void;
  masterGain: GainNode;
};

/**
 * Schedule one bar of music ahead. Returns nodes for cleanup.
 * Call this in a loop to continuously generate music.
 *
 * Each track ID produces a unique "seed profile" that alters:
 * - Tempo (±15% of genre BPM)
 * - Chord voicing rotation and transposition
 * - Melody starting note, interval pattern, and octave
 * - Bass pattern variation
 * - Drum pattern mutation (ghost notes, removed hits)
 * - Filter cutoff and pad detune
 */
export function scheduleBar(
  trackId: string,
  genre: string,
  barIndex: number,
  startTime: number,
  volume: number,
): ScheduledNodes {
  const config = getTrackConfig(trackId, genre);
  const ctx = getAudioContext();

  // --- Per-track seed profile (computed once, deterministic per trackId) ---
  const trackHash = hashString(trackId);
  const profileRand = seededRandom(trackHash);
  const bpm = getBpmForConfig(config, profileRand);

  // Chord rotation: start at a different point in the progression
  const chordOffset = Math.floor(profileRand() * config.chords.length);

  // Transpose: shift by 0, +1, or -1 semitone only (stays in tune)
  const semitoneShift = Math.floor(profileRand() * 3) - 1;
  const transposeRatio = Math.pow(2, semitoneShift / 12);

  // Melody: different starting note (same octave)
  const melodyStartIdx = Math.floor(profileRand() * config.melodyNotes.length);

  // Rhythm variation: small shift (0–2 steps)
  const rhythmShift = Math.floor(profileRand() * 3);
  const rhythmDensity = 0.65 + profileRand() * 0.35; // 65-100% of notes

  // Filter variation: ±15%
  const filterMult = 0.85 + profileRand() * 0.3;

  // Pad detune: subtle chorus (2–6 cents)
  const detuneAmount = 2 + profileRand() * 4;

  // Arp speed variation for arpeggiating genres
  const arpSpeedOptions = [2, 3, 4];
  const arpSpeed = config.arpeggiate ? pickSeeded(arpSpeedOptions, profileRand) : config.arpSpeed;

  // --- Per-bar randomness ---
  const rand = seededRandom(trackHash * 65537 + barIndex * 7919);

  const stepsPerBar = 16;
  const secPerStep = 60 / bpm / 4;
  const nodesToStop: { stop: (t?: number) => void }[] = [];

  const masterGain = ctx.createGain();
  masterGain.gain.value = (volume / 100) * 0.15;

  const reverbNode = createReverb(ctx, config.reverb);
  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - config.reverb * 0.5;
  const wetGain = ctx.createGain();
  wetGain.gain.value = config.reverb * 0.5;
  dryGain.connect(masterGain);
  reverbNode.connect(wetGain).connect(masterGain);
  masterGain.connect(ctx.destination);

  const barEnd = startTime + stepsPerBar * secPerStep;

  // --- PAD ---
  const chordIdx = (barIndex + chordOffset) % config.chords.length;
  const chord = config.chords[chordIdx].map(f => f * transposeRatio);

  if (config.arpeggiate) {
    for (let step = 0; step < stepsPerBar; step += arpSpeed) {
      const noteIdx = (step / arpSpeed) % chord.length;
      const freq = chord[noteIdx];
      const t = startTime + step * secPerStep;
      const dur = secPerStep * arpSpeed * 0.8;

      const osc = ctx.createOscillator();
      osc.type = config.padWave;
      osc.frequency.value = freq;
      osc.detune.value = (rand() - 0.5) * detuneAmount;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(config.padGain, t + 0.01);
      gain.gain.setValueAtTime(config.padGain, t + dur - 0.02);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = config.padFilter * filterMult;
      osc.connect(filter).connect(gain).connect(dryGain);
      gain.connect(reverbNode);
      osc.start(t);
      osc.stop(t + dur + 0.01);
      nodesToStop.push(osc);
    }
  } else {
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = config.padWave;
      osc.frequency.value = freq;
      osc.detune.value = (rand() - 0.5) * detuneAmount + i * 2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(config.padGain, startTime + 0.3);
      gain.gain.setValueAtTime(config.padGain, barEnd - 0.3);
      gain.gain.linearRampToValueAtTime(0, barEnd);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = config.padFilter * filterMult;
      osc.connect(filter).connect(gain).connect(dryGain);
      gain.connect(reverbNode);
      osc.start(startTime);
      osc.stop(barEnd + 0.01);
      nodesToStop.push(osc);
    });
  }

  // --- BASS ---
  const bassIdx = config.bassPattern[(barIndex + chordOffset) % config.bassPattern.length];
  const bassChord = config.chords[bassIdx % config.chords.length].map(f => f * transposeRatio);
  const bassRoot = bassChord[0] / 2; // One octave down — solid bass register

  for (let step = 0; step < stepsPerBar; step += 4) {
    const t = startTime + step * secPerStep;
    const dur = secPerStep * 3.5;
    const osc = ctx.createOscillator();
    osc.type = config.bassWave;
    // Mostly root, occasional fifth or chord tone
    let bassNote = bassRoot;
    const r = rand();
    if (r > 0.85)
      bassNote = bassRoot * 1.5; // fifth
    else if (r > 0.75) bassNote = bassChord[1] / 2; // third
    osc.frequency.value = bassNote;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(config.bassGain, t + 0.02);
    gain.gain.setValueAtTime(config.bassGain * 0.8, t + dur - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain).connect(dryGain);
    osc.start(t);
    osc.stop(t + dur + 0.01);
    nodesToStop.push(osc);
  }

  // --- MELODY ---
  const melodyRand = seededRandom(trackHash * 31337 + barIndex * 13);
  let lastNoteIdx = (melodyStartIdx + barIndex) % config.melodyNotes.length;

  config.melodyRhythm.forEach(baseStep => {
    // Shift rhythm per track (small shift)
    const step = (baseStep + rhythmShift) % stepsPerBar;

    // Density thinning
    if (melodyRand() > rhythmDensity) return;

    const t = startTime + step * secPerStep;
    const dur = secPerStep * (1 + Math.floor(melodyRand() * 2)) * 0.8;

    // Mostly stepwise motion, occasional skip of a third
    const motionRoll = melodyRand();
    let jump: number;
    if (motionRoll > 0.8)
      jump = melodyRand() > 0.5 ? 2 : -2; // third
    else if (motionRoll > 0.3)
      jump = melodyRand() > 0.5 ? 1 : -1; // step
    else jump = 0; // repeat note

    lastNoteIdx = Math.max(0, Math.min(config.melodyNotes.length - 1, lastNoteIdx + jump));
    const freq = config.melodyNotes[lastNoteIdx] * transposeRatio;

    const osc = ctx.createOscillator();
    osc.type = config.melodyWave;
    osc.frequency.value = freq;
    osc.detune.value = (melodyRand() - 0.5) * 6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(config.melodyGain, t + 0.015);
    gain.gain.setValueAtTime(config.melodyGain * 0.7, t + dur - 0.03);
    gain.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(gain).connect(dryGain);
    gain.connect(reverbNode);
    osc.start(t);
    osc.stop(t + dur + 0.01);
    nodesToStop.push(osc);
  });

  // --- DRUMS ---
  if (config.drums) {
    const { steps, pattern } = config.drums;
    // Per-track drum mutation: occasionally drop or add ghost hits
    const drumRand = seededRandom(trackHash * 4919 + barIndex * 3);
    for (let step = 0; step < steps; step++) {
      const t = startTime + step * secPerStep;
      for (const [hit, hits] of Object.entries(pattern) as [DrumHit, number[]][]) {
        const isInPattern = hits.includes(step);
        // Ghost note: small chance to add a hit not in the pattern
        const addGhost = !isInPattern && hit === 'hihat' && drumRand() < 0.15;
        // Drop: small chance to skip a hit
        const drop = isInPattern && drumRand() < 0.08;

        if ((isInPattern && !drop) || addGhost) {
          const humanize = (drumRand() - 0.5) * 0.01;
          const ghostVol = addGhost ? (volume / 100) * 0.5 : volume / 100;
          scheduleDrum(ctx, dryGain, hit, t + humanize, ghostVol);
        }
      }
    }
  }

  return {
    stopAll: (immediate = false) => {
      if (immediate) {
        nodesToStop.forEach(n => {
          try {
            n.stop();
          } catch {}
        });
        masterGain.disconnect();
      } else {
        const now = ctx.currentTime;
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
        setTimeout(() => {
          nodesToStop.forEach(n => {
            try {
              n.stop();
            } catch {}
          });
          masterGain.disconnect();
        }, 400);
      }
    },
    masterGain,
  };
}

export { getAudioContext };
