/**
 * The save file (PLAN.md §1.10, §7.6).
 *
 * Everything that survives a reload lives here: the card collection, the deck, the match record and
 * the chosen opponent. A save is a plain JSON object under one localStorage key.
 *
 * Two things this module is deliberately strict about:
 *
 * **It never trusts what it reads.** `parseSave` validates every field and falls back to an empty
 * save rather than throwing or half-loading. A corrupt save should cost a player their progress, not
 * brick the game on boot with an exception in a module initialiser — and the failure has to be
 * recoverable in the field, where nobody can patch it for you.
 *
 * **It is versioned, and the migration is real.** The v1 format had no `uid` and no `nextUid`,
 * referring to cards by their position in the array. Position stops being an identity the moment a
 * claimed card is inserted into the middle of the collection, so v1 saves are migrated by stamping
 * uids on load rather than being rejected. There is a test that migrates a hand-written v1 payload.
 */

import { scoreCollection, type CollectorScore } from './collector.ts';
import type { ModeId } from './modes.ts';
import type { CardType, OwnedCard, Outcome, StatIndex } from '../core/types.ts';

/** Bump when the shape changes, and add a case to {@link migrate}. */
export const SAVE_VERSION = 3;

/** The localStorage key. Namespaced so it cannot collide with anything else on the origin. */
export const SAVE_KEY = 'tetramaster.save.v1';

export interface MatchRecord {
  readonly matches: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly perfects: number;
}

/**
 * Player preferences (PLAN.md §6, Stage 10).
 *
 * `audio` defaults to **off**. Sound that starts on its own is startling and, for some people,
 * genuinely painful; the player turns it on, never the game.
 *
 * `reduceMotion` starts as `null` and is resolved from `prefers-reduced-motion` at boot, then kept
 * as an explicit choice. `null` means "not yet decided", which is why it is not a plain boolean.
 */
export interface Settings {
  readonly audio: boolean;
  /** 0–1. */
  readonly volume: number;
  readonly reduceMotion: boolean | null;
  /** Which of the three modes to open on (PLAN.md §6). */
  readonly mode: ModeId;
}

export const DEFAULT_SETTINGS: Settings = {
  audio: false,
  volume: 0.6,
  reduceMotion: null,
  mode: 'match',
};

export interface SaveData {
  readonly version: number;
  readonly collection: readonly OwnedCard[];
  /** Uids making up the deck. */
  readonly deck: readonly number[];
  readonly record: MatchRecord;
  /** The next uid to hand out. Never reused, so a stale deck entry cannot collide. */
  readonly nextUid: number;
  /** Personality id of the last opponent faced. */
  readonly opponent: string;
  readonly settings: Settings;
}

/** Just enough of the `Storage` API, so tests can pass a plain object and Node needs no shim. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    collection: [],
    deck: [],
    record: { matches: 0, wins: 0, losses: 0, draws: 0, perfects: 0 },
    nextUid: 1,
    opponent: 'vivi',
    settings: DEFAULT_SETTINGS,
  };
}

/** An in-memory stand-in, used when localStorage is unavailable (private mode, SSR, tests). */
export function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/**
 * Resolves a usable storage. Browsers throw on `localStorage` access in some privacy modes, and a
 * save feature must never be the reason the game fails to start.
 */
let fallback: StorageLike | undefined;

export function defaultStorage(): StorageLike {
  try {
    // Node has no localStorage, and the DOM lib types it as always present, so the check has to be
    // a runtime one. Returning `undefined` here would blow up on the first `.getItem`.
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    if (candidate !== undefined) return candidate;
  } catch {
    // Access itself threw (private mode, blocked storage) — fall through to memory.
  }
  // Memoised: a fresh memoryStorage per call would silently discard every write, which reads as
  // "saving does nothing" and is very hard to see from the call site.
  fallback ??= memoryStorage();
  return fallback;
}

function isCardType(value: unknown): value is CardType {
  return value === 'P' || value === 'M' || value === 'X' || value === 'A';
}

function isIndex(value: unknown): value is StatIndex {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 15;
}

/** Validates a single card, returning `null` rather than throwing so one bad card is not fatal. */
function parseCard(value: unknown, fallbackUid: number): OwnedCard | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.figureId !== 'number') return null;
  if (typeof raw.arrows !== 'number') return null;
  if (!isIndex(raw.atk) || !isIndex(raw.pdef) || !isIndex(raw.mdef)) return null;
  if (!isCardType(raw.type)) return null;
  return {
    uid: typeof raw.uid === 'number' ? raw.uid : fallbackUid,
    figureId: raw.figureId,
    arrows: raw.arrows,
    atk: raw.atk,
    pdef: raw.pdef,
    mdef: raw.mdef,
    type: raw.type,
  };
}

/** Validates a settings blob, falling back field by field rather than wholesale. */
export function parseSettings(value: unknown): Settings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const volume =
    typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1
      ? raw.volume
      : DEFAULT_SETTINGS.volume;
  const mode =
    raw.mode === 'match' || raw.mode === 'tournament' || raw.mode === 'hotseat'
      ? raw.mode
      : DEFAULT_SETTINGS.mode;
  return {
    // Explicitly not `Boolean(raw.audio)`: a save with no settings must come up silent.
    audio: raw.audio === true,
    volume,
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : null,
    mode,
  };
}

function parseRecord(value: unknown): MatchRecord {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const num = (key: string): number => (typeof raw[key] === 'number' ? raw[key] : 0);
  return {
    matches: num('matches'),
    wins: num('wins'),
    losses: num('losses'),
    draws: num('draws'),
    perfects: num('perfects'),
  };
}

/**
 * Migrates an older payload to the current shape.
 *
 * Two steps so far.
 *
 * **v1 → v2.** v1 cards had no `uid`; the array position became the identity. That is unavoidable —
 * a v1 save referred to cards by index and nothing else survived to recover them from.
 *
 * **v2 → v3.** v2 had no `settings`. Unlike uids, these have defaults that are simply *correct*, so
 * the migration is a fill rather than a recovery. Notably `audio` defaults to **off**: a save written
 * before the setting existed must not arrive with sound already on, because the player never asked
 * for it.
 */
function migrate(payload: Record<string, unknown>): Record<string, unknown> {
  const version = typeof payload.version === 'number' ? payload.version : 1;
  if (version >= SAVE_VERSION) return payload;

  // Every step below is applied in order; `payload` is carried forward so a v1 save picks up both.
  let carried: Record<string, unknown> = payload;
  if (version < 3) {
    carried = { ...carried, settings: parseSettings(carried.settings) };
  }
  payload = carried;

  const raw = Array.isArray(payload.collection) ? payload.collection : [];
  const collection = raw.map((entry, index) => {
    const parsed = parseCard(entry, index + 1);
    return parsed === null ? null : { ...parsed, uid: index + 1 };
  });

  // v1 decks were stored as array positions, so shift them to the uids just assigned.
  const deck: unknown[] = Array.isArray(payload.deck) ? payload.deck : [];
  return {
    ...payload,
    version: SAVE_VERSION,
    collection: collection.filter((card): card is OwnedCard => card !== null),
    deck: deck.map((entry) => (typeof entry === 'number' ? entry + 1 : entry)),
    nextUid: collection.length + 1,
  };
}

/** Parses and validates a raw save payload. Never throws. */
export function parseSave(text: string | null): SaveData {
  if (text === null || text === '') return emptySave();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    // Truncated or hand-edited JSON: start over rather than crash on boot.
    return emptySave();
  }
  if (typeof payload !== 'object' || payload === null) return emptySave();

  const migrated = migrate(payload as Record<string, unknown>);
  const raw: unknown[] = Array.isArray(migrated.collection) ? migrated.collection : [];
  const collection: OwnedCard[] = [];
  const seen = new Set<number>();

  raw.forEach((entry, index) => {
    const card = parseCard(entry, index + 1);
    // A duplicated uid would make progression apply to two cards at once; drop it.
    if (card === null || seen.has(card.uid)) return;
    seen.add(card.uid);
    collection.push(card);
  });

  const deck: unknown[] = Array.isArray(migrated.deck) ? migrated.deck : [];
  const deckUids = deck.filter((uid): uid is number => typeof uid === 'number' && seen.has(uid));

  const highest = collection.reduce((max, card) => Math.max(max, card.uid), 0);
  const nextUid =
    typeof migrated.nextUid === 'number' && migrated.nextUid > highest
      ? migrated.nextUid
      : highest + 1;

  return {
    version: SAVE_VERSION,
    collection,
    deck: deckUids,
    record: parseRecord(migrated.record),
    nextUid,
    opponent: typeof migrated.opponent === 'string' ? migrated.opponent : emptySave().opponent,
    settings: parseSettings(migrated.settings),
  };
}

export function serialiseSave(data: SaveData): string {
  return JSON.stringify(data);
}

export function loadSave(storage: StorageLike = defaultStorage()): SaveData {
  try {
    return parseSave(storage.getItem(SAVE_KEY));
  } catch {
    return emptySave();
  }
}

export function writeSave(data: SaveData, storage: StorageLike = defaultStorage()): boolean {
  try {
    storage.setItem(SAVE_KEY, serialiseSave(data));
    return true;
  } catch {
    // Quota exceeded, or storage disabled mid-session. Losing the write is survivable; a thrown
    // exception in the middle of a results screen is not.
    return false;
  }
}

export function clearSave(storage: StorageLike = defaultStorage()): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Nothing useful to do; the next write will fail the same way and be reported.
  }
}

/** Records the result of a match. `perfect` counts as a win as well as a perfect. */
export function recordOutcome(record: MatchRecord, outcome: Outcome): MatchRecord {
  const won = outcome === 'win' || outcome === 'perfect';
  return {
    matches: record.matches + 1,
    wins: record.wins + (won ? 1 : 0),
    losses: record.losses + (outcome === 'loss' ? 1 : 0),
    draws: record.draws + (outcome === 'draw' ? 1 : 0),
    perfects: record.perfects + (outcome === 'perfect' ? 1 : 0),
  };
}

/** Replaces the settings, persisting immediately. */
export function withSettings(data: SaveData, patch: Partial<Settings>): SaveData {
  return { ...data, settings: { ...data.settings, ...patch } };
}

/** Adds cards to the collection, stamping fresh uids. Returns the new save. */
export function addToCollection(
  data: SaveData,
  cards: readonly Omit<OwnedCard, 'uid'>[],
): SaveData {
  let nextUid = data.nextUid;
  const added = cards.map((card) => ({ ...card, uid: nextUid++ }));
  return { ...data, collection: [...data.collection, ...added], nextUid };
}

export interface Profile {
  readonly save: SaveData;
  readonly collector: CollectorScore;
}

/** A save plus its collector score — the shape every screen actually wants. */
export function profile(storage: StorageLike = defaultStorage()): Profile {
  const save = loadSave(storage);
  return { save, collector: scoreCollection(save.collection) };
}
