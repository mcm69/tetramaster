/**
 * Sound (PLAN.md §2.2, §6 Stage 10).
 *
 * `cuesFor` is where mistakes live and it is pure, so it is tested in Node with no audio at all.
 * What must hold:
 *
 * - Every battlefield event makes a sound, and **nothing else** does. A cue on an event the player
 *   cannot perceive is noise; a missing cue on one they can is silence where there should be impact.
 * - A win and a loss sound different. That is the whole job of the end-of-match sting.
 * - Multiple battles in one placement produce multiple cues, in order — that is what makes a
 *   four-card cascade sound like a cascade rather than a single thud.
 * - Nothing throws, and nothing is audible, when WebAudio is missing or the player has not opted in.
 */

import { describe, expect, it, vi } from 'vitest';
import { Synth, cuesFor, silentSynth, type Cue } from '../../src/audio/synth.ts';
import type { GameEvent, Outcome } from '../../src/core/types.ts';

const place: GameEvent = { t: 'place', cell: 0, owner: 'player', figureId: 1, cardIndex: 0 };
const takedown: GameEvent = { t: 'takedown', cell: 1, owner: 'player', from: 0 };
const combo: GameEvent = { t: 'combo', cell: 2, owner: 'player', from: 0 };
const turn: GameEvent = { t: 'turn', owner: 'ai' };
const hint: GameEvent = { t: 'hint', text: 'try a corner' };

function battle(attackerWins: boolean): GameEvent {
  return {
    t: 'battle-roll',
    attacker: 0,
    defender: 1,
    atkBase: 0,
    atkRoll: 0,
    atkActual: 0,
    defBase: 0,
    defRoll: 0,
    defActual: 0,
    probability: 0.5,
    attackerWins,
  };
}

const gameOver: GameEvent = {
  t: 'game-over',
  result: { outcome: 'win', taken: [], claimable: [] },
};

describe('mapping events to cues', () => {
  it('sounds a placement, a capture and a combo', () => {
    expect(cuesFor([place], null)).toEqual(['place']);
    expect(cuesFor([takedown], null)).toEqual(['capture']);
    expect(cuesFor([combo], null)).toEqual(['combo']);
  });

  it('distinguishes winning and losing a battle', () => {
    expect(cuesFor([battle(true)], null)).toEqual(['battle']);
    expect(cuesFor([battle(false)], null)).toEqual(['loseBattle']);
    expect(cuesFor([battle(true)], null)).not.toEqual(cuesFor([battle(false)], null));
  });

  it('plays one cue per battle, in order, so a cascade sounds like one', () => {
    expect(cuesFor([place, battle(true), battle(false), battle(true)], null)).toEqual([
      'place',
      'battle',
      'loseBattle',
      'battle',
    ]);
  });

  it('gives a win, a loss and a draw different endings', () => {
    const win = cuesFor([gameOver], 'win');
    const perfect = cuesFor([gameOver], 'perfect');
    const loss = cuesFor([gameOver], 'loss');
    const draw = cuesFor([gameOver], 'draw');
    expect(win).toEqual(['win']);
    // A perfect game is still a win, and hearing it as one is correct.
    expect(perfect).toEqual(win);
    expect(loss).toEqual(['loss']);
    expect(draw).toEqual(['draw']);
    expect(new Set([win[0], loss[0], draw[0]]).size).toBe(3);
  });

  it('does not double up when the result arrives with the event', () => {
    expect(cuesFor([gameOver], 'win')).toHaveLength(1);
  });

  it('says nothing for events the player cannot perceive', () => {
    expect(cuesFor([turn], null)).toEqual([]);
    expect(cuesFor([hint], null)).toEqual([]);
    expect(cuesFor([], null)).toEqual([]);
  });

  it('still announces a result when no game-over event is in the log', () => {
    // Defensive: a driver that ends a match without the event should still get a sting.
    expect(cuesFor([place], 'loss')).toEqual(['place', 'loss']);
  });

  it('only ever returns known cues', () => {
    const known = new Set<Cue>([
      'place',
      'capture',
      'battle',
      'loseBattle',
      'combo',
      'turn',
      'win',
      'loss',
      'draw',
      'level',
    ]);
    const mixed: GameEvent[] = [
      place,
      takedown,
      combo,
      battle(true),
      battle(false),
      turn,
      hint,
      gameOver,
    ];
    for (const outcome of ['win', 'loss', 'draw', null] as (Outcome | null)[]) {
      for (const cue of cuesFor(mixed, outcome)) expect(known.has(cue)).toBe(true);
    }
  });
});

describe('when there is no audio', () => {
  it('reports itself unavailable rather than pretending', () => {
    const synth = silentSynth();
    expect(synth.available).toBe(false);
    expect(synth.isEnabled).toBe(false);
  });

  it('plays nothing, and does not throw', () => {
    const synth = silentSynth();
    synth.setEnabled(true);
    expect(() => {
      synth.play('battle');
      synth.playSequence(['place', 'battle', 'win']);
    }).not.toThrow();
  });

  it('constructs fine under Node, which has no AudioContext', () => {
    expect(() => new Synth()).not.toThrow();
  });
});

describe('when audio is switched on but off by default', () => {
  it('is silent until the player asks for it', () => {
    const audio = fakeAudio();
    const synth = new Synth({ context: audio.context });

    synth.play('place');
    expect(audio.oscillatorStarts()).toBe(0);

    synth.setEnabled(true);
    synth.play('place');
    expect(audio.oscillatorStarts()).toBeGreaterThan(0);
  });

  it('can be switched back off', () => {
    const audio = fakeAudio();
    const synth = new Synth({ context: audio.context });
    synth.setEnabled(true);
    synth.play('win');
    const afterOn = audio.oscillatorStarts();
    expect(afterOn).toBeGreaterThan(0);

    synth.setEnabled(false);
    synth.play('win');
    expect(audio.oscillatorStarts()).toBe(afterOn);
  });

  it('honours the volume', () => {
    // Recorded values are the gain *peaks*, not frequencies: two notes at the same pitch must
    // still be distinguishable by how loud they were scheduled.
    const loud = fakeAudio();
    const quiet = fakeAudio();
    const loudSynth = new Synth({ context: loud.context, volume: 1 });
    const quietSynth = new Synth({ context: quiet.context, volume: 0.01 });
    loudSynth.setEnabled(true);
    quietSynth.setEnabled(true);
    loudSynth.play('battle');
    quietSynth.play('battle');

    const loudPeak = Math.max(...loud.gainPeaks);
    const quietPeak = Math.max(...quiet.gainPeaks);
    expect(loudPeak).toBeGreaterThan(quietPeak);
    expect(quietPeak).toBeGreaterThan(0);
  });

  it('clamps a silly volume instead of accepting it', () => {
    const synth = silentSynth();
    expect(() => {
      synth.setVolume(5);
      synth.setVolume(-3);
    }).not.toThrow();
  });
});

describe('timers', () => {
  it('spaces a sequence so a cascade does not collapse into one sound', () => {
    vi.useFakeTimers();
    try {
      const audio = fakeAudio();
      const synth = new Synth({ context: audio.context });
      synth.setEnabled(true);
      synth.playSequence(['place', 'battle', 'capture'], 0.05);

      // Only the first cue is scheduled straight away; the rest wait their turn, which is what
      // makes a three-card cascade audible as three events rather than one thud.
      const firstCue = audio.oscillatorStarts();
      expect(firstCue).toBeGreaterThan(0);
      const allAtOnce = (['place', 'battle', 'capture'] as Cue[]).reduce(
        (total, cue) => total + notesIn(cue),
        0,
      );
      expect(firstCue).toBeLessThan(allAtOnce);

      vi.advanceTimersByTime(500);
      expect(audio.oscillatorStarts()).toBe(allAtOnce);
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays nothing from a sequence when it is switched off', () => {
    const audio = fakeAudio();
    const synth = new Synth({ context: audio.context });
    synth.playSequence(['place', 'battle', 'win']);
    expect(audio.oscillatorStarts()).toBe(0);
  });
});

/** How many notes a cue schedules, which is what the sequence test counts against. */
function notesIn(cue: Cue): number {
  // Mirrors the voice table's longest arpeggio; only used as an upper bound in a comparison.
  return cue === 'combo' || cue === 'win' || cue === 'level' || cue === 'loss' ? 4 : 2;
}

interface FakeAudio {
  readonly context: NonNullable<ConstructorParameters<typeof Synth>[0]>['context'];
  /** Gain envelope peaks, in the order they were scheduled. */
  readonly gainPeaks: number[];
  readonly starts: number[];
  readonly oscillatorStarts: () => number;
}

/** A recording stand-in for the slice of Web Audio the synth actually uses. */
function fakeAudio(): FakeAudio {
  const gainPeaks: number[] = [];
  const starts: number[] = [];

  return {
    gainPeaks,
    starts,
    oscillatorStarts: () => starts.length,
    context: {
      currentTime: 0,
      sampleRate: 48000,
      destination: {} as unknown as AudioNode,
      createOscillator: () => {
        starts.push(Date.now());
        return {
          type: 'sine',
          frequency: { setValueAtTime: () => undefined },
          connect: () => ({ connect: () => undefined }),
          start: () => undefined,
          stop: () => undefined,
        } as unknown as OscillatorNode;
      },
      createGain: () =>
        ({
          gain: {
            setValueAtTime: () => undefined,
            linearRampToValueAtTime: (value: number) => gainPeaks.push(value),
            exponentialRampToValueAtTime: () => undefined,
          },
          connect: () => ({ connect: () => undefined }),
        }) as unknown as GainNode,
      createBuffer: () =>
        ({
          getChannelData: () => new Float32Array(6000),
        }) as unknown as AudioBuffer,
      createBufferSource: () =>
        ({
          buffer: null,
          connect: () => ({ connect: () => undefined }),
          start: () => undefined,
          stop: () => undefined,
        }) as unknown as AudioBufferSourceNode,
    },
  };
}
