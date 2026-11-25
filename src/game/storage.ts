/**
 * Saved players (v7). Everything lives in the browser's IndexedDB:
 *   players — one record per player, key = name in lower case;
 *   meta    — the current player, the shared leaderboard, the migration flag.
 * The game reads a synchronous in-memory copy loaded once at boot (`storage.init()`);
 * writes update the copy and are sent to IndexedDB in the background.
 * Without IndexedDB (old browser, blocked storage) the copy is kept in localStorage instead.
 */
export type Headgear = 'none' | 'headband' | 'hood' | 'hat';
export type WeaponId = 'sword' | 'axe';

export interface Profile {
  name: string;
  headgear: Headgear;
}

export interface ScoreEntry {
  name: string;
  score: number;
  chapter: number;
  level: number;
  weapon: WeaponId;
  date: number;
}

export interface Progress {
  unlockedChapter: number;
}

/** Where the hero is: chapter and level (-1 = the chapter's camp). */
export interface Spot {
  chapter: number;
  level: number;
}

export interface PlayerSave {
  key: string;
  name: string;
  headgear: Headgear;
  unlockedChapter: number;
  at: Spot | null;
}

// v1..v6 keys (localStorage), migrated once.
const OLD_PROFILE = 'kristole.profile';
const OLD_BOARD = 'kristole.leaderboard';
const OLD_PROGRESS = 'kristole.progress';
/** Fallback copy when IndexedDB is unavailable. */
const FALLBACK = 'kristole.v7';

const DB_NAME = 'kristole';
const DEFAULT_NAME = 'PLAYER';

/** Name rules: trimmed, inner spaces become dashes, upper case like the rest of the UI. */
export function cleanName(name: string) {
  const s = name.trim().replace(/\s+/g, '-').toUpperCase();
  return s || DEFAULT_NAME;
}
export const nameKey = (name: string) => cleanName(name).toLowerCase();

const newPlayer = (name: string, headgear: Headgear = 'headband'): PlayerSave => ({
  key: nameKey(name), name: cleanName(name), headgear, unlockedChapter: 0, at: null,
});

function readOld<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// ---- in-memory state ----
const players = new Map<string, PlayerSave>();
let currentKey = nameKey(DEFAULT_NAME);
let board: ScoreEntry[] = [];
let db: IDBDatabase | null = null;
let ready = false;

function current(): PlayerSave {
  let p = players.get(currentKey);
  if (!p) {
    p = newPlayer(DEFAULT_NAME);
    currentKey = p.key;
    players.set(p.key, p);
  }
  return p;
}

// ---- persistence ----
function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('players')) d.createObjectStore('players', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('indexedDB blocked'));
  });
}

function saveFallback() {
  try {
    window.localStorage.setItem(FALLBACK, JSON.stringify({ players: [...players.values()], current: currentKey, board }));
  } catch {
    /* storage unavailable: progress just isn't kept */
  }
}

function putPlayer(p: PlayerSave) {
  if (!db) return saveFallback();
  try {
    db.transaction('players', 'readwrite').objectStore('players').put({ ...p, at: p.at ? { ...p.at } : null });
  } catch {
    saveFallback();
  }
}

function putMeta(key: string, value: unknown) {
  if (!db) return saveFallback();
  try {
    db.transaction('meta', 'readwrite').objectStore('meta').put(value, key);
  } catch {
    saveFallback();
  }
}

/** Moves v1..v6 localStorage data in: scores to the shared board, open chapters to the current player. */
function migrateOld() {
  const prof = readOld<Partial<Profile>>(OLD_PROFILE);
  const prog = readOld<Partial<Progress>>(OLD_PROGRESS);
  const oldBoard = readOld<ScoreEntry[]>(OLD_BOARD);
  const p = newPlayer(prof?.name ?? DEFAULT_NAME, prof?.headgear ?? 'headband');
  p.unlockedChapter = Math.max(0, Number(prog?.unlockedChapter ?? 0) || 0);
  players.set(p.key, p);
  currentKey = p.key;
  if (Array.isArray(oldBoard)) board = oldBoard.filter((e) => typeof e?.score === 'number');
}

async function load() {
  try {
    db = await Promise.race([
      openDb(),
      new Promise<never>((_r, rej) => setTimeout(() => rej(new Error('indexedDB timeout')), 2500)),
    ]);
  } catch {
    db = null;
  }
  if (db) {
    const t = db.transaction(['players', 'meta'], 'readonly');
    const [list, cur, b, migrated] = await Promise.all([
      req(t.objectStore('players').getAll() as IDBRequest<PlayerSave[]>),
      req(t.objectStore('meta').get('current') as IDBRequest<string | undefined>),
      req(t.objectStore('meta').get('board') as IDBRequest<ScoreEntry[] | undefined>),
      req(t.objectStore('meta').get('migrated') as IDBRequest<boolean | undefined>),
    ]);
    for (const p of list) players.set(p.key, p);
    if (cur) currentKey = cur;
    if (Array.isArray(b)) board = b;
    if (!migrated) {
      if (!list.length) migrateOld();
      putMeta('migrated', true);
      for (const p of players.values()) putPlayer(p);
      putMeta('current', currentKey);
      putMeta('board', board);
    }
  } else {
    const fb = readOld<{ players: PlayerSave[]; current: string; board: ScoreEntry[] }>(FALLBACK);
    if (fb) {
      for (const p of fb.players ?? []) players.set(p.key, p);
      currentKey = fb.current ?? currentKey;
      board = fb.board ?? [];
    } else migrateOld();
  }
  current();
}

let loading: Promise<void> | null = null;

export const storage = {
  /** Loads saved players once; call before the first scene. */
  init(): Promise<void> {
    if (!loading) loading = load().catch(() => current() && undefined).then(() => { ready = true; });
    return loading;
  },
  get ready() {
    return ready;
  },

  getProfile(): Profile {
    const p = current();
    return { name: p.name, headgear: p.headgear };
  },
  /**
   * Saves the avatar. A new name switches player: a name that exists loads that player,
   * a new one creates a fresh player (with the headgear chosen now).
   */
  setProfile(prof: Profile): 'same' | 'loaded' | 'created' {
    const key = nameKey(prof.name);
    const cur = current();
    if (key === cur.key) {
      cur.headgear = prof.headgear;
      putPlayer(cur);
      return 'same';
    }
    let p = players.get(key);
    const created = !p;
    if (!p) {
      p = newPlayer(prof.name, prof.headgear);
      players.set(key, p);
      putPlayer(p);
    }
    currentKey = key;
    putMeta('current', key);
    return created ? 'created' : 'loaded';
  },
  playerNames(): string[] {
    return [...players.values()].map((p) => p.name);
  },

  getBoard(): ScoreEntry[] {
    return board
      .filter((e) => typeof e.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  },
  /** Adds a score, returns its rank (0-based) or -1 if it didn't make the top 10. */
  addScore(entry: ScoreEntry): number {
    board.push(entry);
    board.sort((a, b) => b.score - a.score);
    board = board.slice(0, 10);
    putMeta('board', board);
    return board.indexOf(entry);
  },

  getProgress(): Progress {
    return { unlockedChapter: current().unlockedChapter };
  },
  unlockChapter(idx: number) {
    const p = current();
    if (idx > p.unlockedChapter) {
      p.unlockedChapter = idx;
      putPlayer(p);
    }
  },

  /** Where the hero was last: the map puts him there, a death resumes from that level. */
  getSpot(): Spot | null {
    const at = current().at;
    return at ? { ...at } : null;
  },
  setSpot(chapter: number, level: number) {
    const p = current();
    if (chapter > p.unlockedChapter) return; // test shortcuts into locked chapters don't count
    if (p.at && p.at.chapter === chapter && p.at.level === level) return;
    p.at = { chapter, level };
    putPlayer(p);
  },
  /** The level to resume a chapter from (after its camp), if the hero stopped inside it. */
  resumeLevel(chapter: number): number | undefined {
    const at = current().at;
    return at && at.chapter === chapter && at.level >= 0 ? at.level : undefined;
  },
};
