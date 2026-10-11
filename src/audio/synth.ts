/**
 * Procedural sound (PLAN.md §2.2, §6 Stage 10).
 *
 * Every sound is synthesised from oscillators and noise. Nothing is loaded, sampled or shipped, which
 * keeps the "no copyrighted assets" rule absolute — and it means a new sound is a function, not a
 * binary someone has to license.
 *
 * Three decisions worth stating:
 *
 * **Off by default.** Audio that starts on its own is startling and, for some people, genuinely
 * painful. The player turns it on; the game never does.
 *
 * **Nothing throws without WebAudio.** `AudioContext` is absent in Node and in some browsers until a
 * gesture, and a missing audio stack must never take the board down with it. Every entry point is a
 * no-op when it is unavailable, so the rest of the app needs no guards of its own.
 *
 * **The testable part is separate from the part that plays.** `cueFor` maps a domain event to a sound
 * *name*, with no audio in sight. That mapping is where mistakes live — a battle that ticks like a
 * card landing, a flip that plays the victory sting — so it is covered by tests that run in Node.
 */

import type { GameEvent, Outcome } from '../core/types.ts';

/** Every sound the game can make. */
export type Cue =
  | 'place'
  | 'capture'
  | 'battle'
  | 'loseBattle'
  | 'combo'
  | 'turn'
  | 'win'
  | 'loss'
  | 'draw'
  | 'level';

/** The match result a `game-over` event carries. */
export type EventOutcome = Outcome | null;

/**
 * Maps an event from the match log to the sound it should make.
 *
 * `battle` and `loseBattle` are separate cues rather than one pitch-shifted sound, because a battle
 * is the most frequent event in the game and the player needs to hear the result, not just that
 * something happened. Multiple battles in one placement each get their own cue, in order, which is
 * what makes a four-card cascade sound like a cascade.
 */
export function cuesFor(events: readonly GameEvent[], outcome: EventOutcome): Cue[] {
  const cues: Cue[] = [];
  for (const event of events) {
    switch (event.t) {
      case 'place':
        cues.push('place');
        break;
      case 'takedown':
        cues.push('capture');
        break;
      case 'combo':
        cues.push('combo');
        break;
      case 'battle-roll':
        cues.push(event.attackerWins ? 'battle' : 'loseBattle');
        break;
      case 'game-over':
        cues.push(outcome === 'loss' ? 'loss' : outcome === 'draw' ? 'draw' : 'win');
        break;
      default:
        break;
    }
  }
  if (outcome !== null && !cues.some((cue) => cue === 'win' || cue === 'loss' || cue === 'draw')) {
    cues.push(outcome === 'loss' ? 'loss' : outcome === 'draw' ? 'draw' : 'win');
  }
  return cues;
}

/** Per-cue synthesis parameters: frequency, decay, and how noisy it is. */
interface Voice {
  readonly wave: OscillatorType;
  readonly hz: readonly number[];
  readonly decay: number;
  readonly gain: number;
  /** 0–1. Above zero mixes in a burst of filtered noise, which is what makes a "click". */
  readonly noise: number;
}

const VOICES: Record<Cue, Voice> = {
  // A card going down: a short wooden knock.
  place: { wave: 'triangle', hz: [320, 210], decay: 0.09, gain: 0.25, noise: 0.5 },
  // A free capture: a quick upward chirp, because something was gained.
  capture: { wave: 'square', hz: [520, 880], decay: 0.13, gain: 0.18, noise: 0.15 },
  // Winning a battle: a firm mid tone.
  battle: { wave: 'sawtooth', hz: [392, 587], decay: 0.18, gain: 0.2, noise: 0.3 },
  // Losing one: the same shape, bent down, so the pair reads as related.
  loseBattle: { wave: 'sawtooth', hz: [330, 208], decay: 0.2, gain: 0.18, noise: 0.35 },
  // A combo: a rising arpeggio, the one sound that climbs.
  combo: { wave: 'square', hz: [440, 554, 659, 880], decay: 0.26, gain: 0.16, noise: 0 },
  turn: { wave: 'sine', hz: [294], decay: 0.08, gain: 0.12, noise: 0 },
  win: { wave: 'triangle', hz: [392, 494, 587, 784], decay: 0.5, gain: 0.24, noise: 0.05 },
  loss: { wave: 'triangle', hz: [392, 330, 262], decay: 0.55, gain: 0.2, noise: 0.05 },
  draw: { wave: 'sine', hz: [349, 349], decay: 0.4, gain: 0.18, noise: 0 },
  level: { wave: 'sine', hz: [523, 659, 784, 1047], decay: 0.6, gain: 0.22, noise: 0 },
};

/** The subset of the Web Audio API this module uses. */
export interface AudioLike {
  readonly currentTime: number;
  readonly destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
  readonly sampleRate: number;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
}

export interface SynthOptions {
  /** Master volume, 0–1. Zero silences everything without tearing the graph down. */
  readonly volume?: number;
  /** Lets a test or a headless environment supply its own context. */
  readonly context?: AudioLike | null;
}

export class Synth {
  private ctx: AudioLike | null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = false;
  private level: number;

  constructor(options: SynthOptions = {}) {
    this.level = options.volume ?? 0.6;
    this.ctx = options.context ?? createDefaultContext();
  }

  /** True when audio can actually be produced. `enabled` is the player's choice on top of this. */
  get available(): boolean {
    return this.ctx !== null;
  }

  get isEnabled(): boolean {
    return this.enabled && this.available;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setVolume(volume: number): void {
    this.level = Math.max(0, Math.min(1, volume));
  }

  /**
   * Plays one cue. Safe to call when audio is unavailable or switched off.
   *
   * The gain envelope ends at exactly zero rather than near it, so a finished node is
   * collectable — otherwise a long match leaks an oscillator per event and the graph grows without
   * bound.
   */
  play(cue: Cue): void {
    if (!this.isEnabled) return;
    const ctx = this.ctx;
    if (ctx === null) return;
    const voice = VOICES[cue];
    const start = ctx.currentTime;

    voice.hz.forEach((hz, index) => {
      // Notes in an arpeggio start a fixed distance apart rather than all at once.
      const at = start + index * (voice.decay / Math.max(1, voice.hz.length));
      this.tone(ctx, voice, hz, at);
      if (voice.noise > 0) this.click(ctx, voice, at);
    });
  }

  /** Plays a run of cues, spaced so a cascade does not collapse into one sound. */
  /**
   * Plays sounds at explicit offsets from now.
   *
   * `playSequence` spaces cues evenly, which is right for "here is a list, in order" and wrong for
   * "here is a match's worth of events and here is the picture they go with". The offsets come from
   * the animator's own schedule, so a battle is heard while its numbers are rolling rather than at
   * some arbitrary point in a burst.
   */
  playTimeline(entries: readonly { readonly cue: Cue; readonly delayMs: number }[]): void {
    if (!this.isEnabled) return;
    for (const entry of entries) {
      const ctx = this.ctx;
      if (ctx === null) return;
      if (entry.delayMs <= 0) {
        this.play(entry.cue);
        continue;
      }
      globalThis.setTimeout(() => {
        this.play(entry.cue);
      }, entry.delayMs);
    }
  }

  playSequence(cues: readonly Cue[], spacing = 0.07): void {
    if (!this.isEnabled) return;
    cues.forEach((cue, index) => {
      const ctx = this.ctx;
      if (ctx === null) return;
      const delay = index * spacing;
      if (delay === 0) {
        this.play(cue);
      } else {
        globalThis.setTimeout(() => {
          this.play(cue);
        }, delay * 1000);
      }
    });
  }

  private tone(ctx: AudioLike, voice: Voice, hz: number, at: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(hz, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(voice.gain * this.level, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + voice.decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + voice.decay + 0.01);
  }

  private click(ctx: AudioLike, voice: Voice, at: number): void {
    const buffer = this.bufferFor(ctx);
    if (buffer === null) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(voice.noise * voice.gain * this.level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + voice.decay * 0.6);
    source.connect(gain).connect(ctx.destination);
    source.start(at);
    source.stop(at + voice.decay);
  }

  /** One noise burst, generated once and reused. */
  private bufferFor(ctx: AudioLike): AudioBuffer | null {
    if (this.noiseBuffer !== null) return this.noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic noise: this is a percussive transient, not an aesthetic choice, and a seeded
    // value keeps it identical every run.
    let state = 0x9e3779b9;
    for (let i = 0; i < length; i++) {
      state = (state + 0x6d2b79f5) >>> 0;
      data[i] = ((state >>> 8) / 8388608 - 1) * (1 - i / length);
    }
    this.noiseBuffer = buffer;
    return buffer;
  }
}

/**
 * The browser's audio context, or null.
 *
 * `AudioContext` is a vendor-prefixed global on older Safari, and some browsers only allow it to be
 * constructed after a user gesture — so a throw here is expected, not exceptional.
 */
function createDefaultContext(): AudioLike | null {
  try {
    const Ctor =
      (
        globalThis as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        }
      ).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return null;
    return new Ctor();
  } catch {
    return null;
  }
}

/** A Synth that is always silent — the default when audio is off. */
export function silentSynth(): Synth {
  return new Synth({ context: null });
}
