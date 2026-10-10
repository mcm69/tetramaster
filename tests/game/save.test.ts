/**
 * The save file (PLAN.md §1.10, §7.6).
 *
 * This module is the one place where a bug destroys a player's real progress, so the tests lean on
 * the two properties that actually matter: **it never throws on bad input**, and **it never silently
 * loses or corrupts a card**. A save that loads as "empty" is recoverable; a save that loads with
 * two cards sharing a uid is not, because progression would then grow both at once.
 */

import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY,
  SAVE_VERSION,
  addToCollection,
  clearSave,
  defaultStorage,
  emptySave,
  loadSave,
  DEFAULT_SETTINGS,
  memoryStorage,
  parseSave,
  parseSettings,
  withSettings,
  profile,
  recordOutcome,
  serialiseSave,
  writeSave,
} from '../../src/game/save.ts';
import { acquireCard } from '../../src/game/progression.ts';
import { createRng } from '../../src/core/rng.ts';
import type { OwnedCard, Outcome } from '../../src/core/types.ts';

function owned(uid: number, figureId = uid, arrows = 1 << (uid % 8)): OwnedCard {
  return { uid, figureId, arrows, atk: 3, pdef: 4, mdef: 5, type: 'P' };
}

describe('round trip', () => {
  it('[§1.9] writes and reads back an identical save', () => {
    const storage = memoryStorage();
    const data = {
      ...emptySave(),
      collection: [owned(1), owned(2, 2)],
      deck: [2, 1],
      nextUid: 3,
      opponent: 'kuja',
    };
    expect(writeSave(data, storage)).toBe(true);
    expect(loadSave(storage)).toEqual(data);
  });

  it('stores under a namespaced key', () => {
    const storage = memoryStorage();
    writeSave(emptySave(), storage);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
  });

  it('serialises to JSON a human could read', () => {
    const text = serialiseSave({ ...emptySave(), collection: [owned(1)] });
    expect(() => {
      JSON.parse(text);
    }).not.toThrow();
    expect(text).toContain('"uid":1');
  });

  it('returns an empty save when nothing has been written', () => {
    expect(loadSave(memoryStorage())).toEqual(emptySave());
  });
});

describe('bad input never throws', () => {
  const rubbish: [string, unknown][] = [
    ['truncated JSON', '{"version":2,"collection":['],
    ['a JSON array', '[]'],
    ['a JSON string', '"hello"'],
    ['null', 'null'],
    ['a number', '42'],
    ['empty string', ''],
  ];

  it('[§1.9] falls back to an empty save', () => {
    for (const [label, text] of rubbish) {
      const result = parseSave(text as string);
      expect(result.version, label).toBe(SAVE_VERSION);
      expect(result.collection.length, label).toBe(0);
    }
  });

  it('survives a storage that throws on read', () => {
    const hostile = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadSave(hostile)).toEqual(emptySave());
  });

  it('survives a storage that throws on write', () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => {},
    };
    expect(writeSave(emptySave(), hostile)).toBe(false);
  });

  it('survives clearSave on a hostile storage', () => {
    expect(() => {
      clearSave({
        getItem: () => null,
        setItem: () => {
          /* never called */
        },
        removeItem: () => {
          throw new Error('nope');
        },
      });
    }).not.toThrow();
  });

  it('drops individual malformed cards but keeps the good ones', () => {
    const text = JSON.stringify({
      version: SAVE_VERSION,
      collection: [
        owned(1),
        { uid: 2, figureId: 3, arrows: 1, atk: 99, pdef: 4, mdef: 5, type: 'P' }, // stat out of range
        { uid: 3, figureId: 3, arrows: 1, atk: 4, pdef: 4, mdef: 5, type: 'Z' }, // bad type
        null,
        'nonsense',
        owned(4),
      ],
      deck: [],
      nextUid: 5,
    });
    const result = parseSave(text);
    expect(result.collection.map((c) => c.uid)).toEqual([1, 4]);
  });

  it('[§1.9] drops a card whose uid collides with another', () => {
    // Two cards sharing a uid would both grow on one progression roll.
    const text = JSON.stringify({
      version: SAVE_VERSION,
      collection: [owned(1, 10), owned(1, 11)],
      nextUid: 2,
    });
    const result = parseSave(text);
    expect(result.collection).toHaveLength(1);
  });

  it('drops deck entries that point at cards that no longer exist', () => {
    const text = JSON.stringify({
      version: SAVE_VERSION,
      collection: [owned(1)],
      deck: [1, 99, 'x'],
      nextUid: 2,
    });
    expect(parseSave(text).deck).toEqual([1]);
  });

  it('[§1.9] repairs a nextUid that would hand out a colliding one', () => {
    const text = JSON.stringify({
      version: SAVE_VERSION,
      collection: [owned(9)],
      nextUid: 2,
    });
    expect(parseSave(text).nextUid).toBe(10);
  });

  it('repairs a missing record', () => {
    const result = parseSave(JSON.stringify({ version: SAVE_VERSION, collection: [] }));
    expect(result.record.matches).toBe(0);
    expect(result.record.wins).toBe(0);
  });
});

describe('migration', () => {
  /** A v1 save: no uid on cards, deck stored as array positions. */
  const v1 = JSON.stringify({
    version: 1,
    collection: [
      { figureId: 4, arrows: 2, atk: 5, pdef: 6, mdef: 7, type: 'P' },
      { figureId: 9, arrows: 5, atk: 8, pdef: 9, mdef: 10, type: 'X' },
    ],
    deck: [0, 1],
    record: { matches: 4, wins: 3, losses: 1, draws: 0, perfects: 1 },
  });

  it('[§1.9] loads a v1 payload rather than discarding it', () => {
    const result = parseSave(v1);
    expect(result.version).toBe(SAVE_VERSION);
    expect(result.collection).toHaveLength(2);
    expect(result.record.matches).toBe(4);
    expect(result.record.perfects).toBe(1);
  });

  it('[§1.9] stamps unique uids onto v1 cards, by position', () => {
    const result = parseSave(v1);
    expect(result.collection.map((c) => c.uid)).toEqual([1, 2]);
    expect(new Set(result.collection.map((c) => c.uid)).size).toBe(2);
  });

  it('converts a v1 deck from positions to uids', () => {
    expect(parseSave(v1).deck).toEqual([1, 2]);
  });

  it('sets nextUid past every migrated card', () => {
    expect(parseSave(v1).nextUid).toBe(3);
  });

  it('handles a v1 payload with no version field at all', () => {
    const text = JSON.stringify({
      collection: [{ figureId: 1, arrows: 1, atk: 1, pdef: 1, mdef: 1, type: 'M' }],
    });
    const result = parseSave(text);
    expect(result.version).toBe(SAVE_VERSION);
    expect(result.collection[0]!.uid).toBe(1);
  });

  it('leaves a current payload untouched', () => {
    const data = { ...emptySave(), collection: [owned(7, 3, 3)], nextUid: 8 };
    expect(parseSave(serialiseSave(data))).toEqual(data);
  });
});

describe('settings', () => {
  it('comes up silent, with audio off and motion unresolved', () => {
    const settings = parseSave(null).settings;
    expect(settings.audio).toBe(false);
    expect(settings.reduceMotion).toBeNull();
    expect(settings.mode).toBe('match');
  });

  it('round-trips', () => {
    const store = memoryStorage();
    const data = {
      ...emptySave(),
      settings: { audio: true, volume: 0.3, reduceMotion: true, mode: 'tournament' as const },
    };
    writeSave(data, store);
    expect(loadSave(store).settings).toEqual(data.settings);
  });

  it('rejects a bad field without discarding the good ones', () => {
    const settings = parseSettings({
      audio: 'yes',
      volume: 7,
      reduceMotion: true,
      mode: 'nonsense',
    });
    // A string is not consent to make noise.
    expect(settings.audio).toBe(false);
    expect(settings.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(settings.reduceMotion).toBe(true);
    expect(settings.mode).toBe('match');
  });

  it('only accepts a real mode', () => {
    for (const mode of ['match', 'tournament', 'hotseat'] as const) {
      expect(parseSettings({ mode }).mode).toBe(mode);
    }
  });

  it('merges a patch without dropping the rest', () => {
    const merged = withSettings(emptySave(), { audio: true });
    expect(merged.settings.audio).toBe(true);
    expect(merged.settings.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(merged.settings.mode).toBe('match');
  });
});

describe('v2 to v3', () => {
  const v2 = JSON.stringify({
    version: 2,
    collection: [{ uid: 1, figureId: 3, arrows: 1, atk: 4, pdef: 5, mdef: 6, type: 'P' }],
    deck: [1],
    record: { matches: 2, wins: 1, losses: 1, draws: 0, perfects: 0 },
    nextUid: 2,
    opponent: 'gil',
  });

  it('loads a v2 save rather than discarding it', () => {
    const result = parseSave(v2);
    expect(result.version).toBe(SAVE_VERSION);
    expect(result.collection).toHaveLength(1);
    expect(result.record.matches).toBe(2);
    expect(result.opponent).toBe('gil');
  });

  it('fills in default settings, with sound off', () => {
    // A save written before the setting existed must not arrive with sound already on: the player
    // never asked for it.
    expect(parseSave(v2).settings).toEqual(DEFAULT_SETTINGS);
    expect(parseSave(v2).settings.audio).toBe(false);
  });

  it('migrates a v1 save through both steps', () => {
    const v1 = JSON.stringify({
      version: 1,
      collection: [{ figureId: 4, arrows: 2, atk: 5, pdef: 6, mdef: 7, type: 'P' }],
      deck: [0],
    });
    const result = parseSave(v1);
    expect(result.version).toBe(SAVE_VERSION);
    expect(result.collection.map((c) => c.uid)).toEqual([1]);
    expect(result.deck).toEqual([1]);
    expect(result.settings.audio).toBe(false);
  });

  it('leaves a current payload untouched', () => {
    const current = serialiseSave(emptySave());
    expect(parseSave(current)).toEqual(emptySave());
  });
});

describe('record', () => {
  it('counts every outcome once', () => {
    let record = emptySave().record;
    const cases: [Outcome, number][] = [
      ['win', record.wins],
      ['loss', 0],
      ['draw', 0],
      ['perfect', 0],
    ];
    for (const [outcome] of cases) record = recordOutcome(record, outcome);
    expect(record.matches).toBe(4);
    expect(record.wins).toBe(2); // win + perfect
    expect(record.losses).toBe(1);
    expect(record.draws).toBe(1);
    expect(record.perfects).toBe(1);
  });

  it('treats a perfect game as a win as well as a perfect', () => {
    const record = recordOutcome(emptySave().record, 'perfect');
    expect(record.wins).toBe(1);
    expect(record.perfects).toBe(1);
  });
});

describe('collection editing', () => {
  it('stamps unique uids on added cards', () => {
    const rng = createRng(3);
    const strip = (card: OwnedCard): Omit<OwnedCard, 'uid'> => ({
      figureId: card.figureId,
      arrows: card.arrows,
      atk: card.atk,
      pdef: card.pdef,
      mdef: card.mdef,
      type: card.type,
    });
    const data = addToCollection(emptySave(), [
      strip(acquireCard(0, 0, rng)),
      strip(acquireCard(0, 1, rng)),
    ]);
    expect(data.collection.map((c) => c.uid)).toEqual([1, 2]);
    expect(data.nextUid).toBe(3);
  });

  it('does not mutate the save it was given', () => {
    const original = emptySave();
    addToCollection(original, [{ figureId: 1, arrows: 1, atk: 1, pdef: 1, mdef: 1, type: 'P' }]);
    expect(original.collection).toHaveLength(0);
  });
});

describe('storage resolution', () => {
  it('returns something usable', () => {
    expect(() => defaultStorage()).not.toThrow();
  });

  it('falls back to memory when localStorage is absent', () => {
    // Node has no localStorage; the fallback must still work end to end.
    const storage = defaultStorage();
    writeSave({ ...emptySave(), opponent: 'gil' }, storage);
    expect(loadSave(storage).opponent).toBe('gil');
  });

  it('reports the profile for a saved collection', () => {
    const storage = memoryStorage();
    writeSave({ ...emptySave(), collection: [owned(1), owned(2, 2)] }, storage);
    const result = profile(storage);
    expect(result.save.collection).toHaveLength(2);
    expect(result.collector.points).toBe(30); // two unique figures, two unique patterns
  });
});
