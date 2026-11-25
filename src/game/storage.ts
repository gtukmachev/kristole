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
  /** Chapter the hero stands on (the map), and the level he was in. */
  at: Spot | null;
  /** Per chapter: the level to resume from after a death or a break (none = from the start). */
  resume?: Record<number, number>;
  /** The weapon the player picked (none yet = ask before the first fight). */
  weapon?: WeaponId | null;
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
  key: nameKey(name), name: cleanName(name), headgear, unlockedChapter: 0, at: null, weapon: null,
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

/** Two copies of one player (another tab, the fallback copy): open chapters never go down. */
function mergePlayer(older: PlayerSave | undefined, newer: PlayerSave): PlayerSave {
  if (!older) return newer;
  return {
    ...newer,
    unlockedChapter: Math.max(older.unlockedChapter, newer.unlockedChapter),
    resume: { ...(older.resume ?? {}), ...(newer.resume ?? {}) },
    weapon: newer.weapon ?? older.weapon ?? null,
  };
}

const scoreKey = (e: ScoreEntry) => `${e.name}|${e.score}|${e.date}`;
function mergeBoard(a: ScoreEntry[], b: ScoreEntry[]) {
  const seen = new Map<string, ScoreEntry>();
  for (const e of [...a, ...b]) if (typeof e?.score === 'number') seen.set(scoreKey(e), e);
  return [...seen.values()].sort((x, y) => y.score - x.score).slice(0, 10);
}

const plain = (p: PlayerSave): PlayerSave => ({ ...p, at: p.at ? { ...p.at } : null, resume: { ...(p.resume ?? {}) } });

/** Runs a read-modify-write in one transaction; any failure keeps a local copy instead. */
function write(store: 'players' | 'meta', fn: (os: IDBObjectStore) => void) {
  if (!db) return saveFallback();
  try {
    const tx = db.transaction(store, 'readwrite');
    tx.onerror = tx.onabort = () => saveFallback();
    fn(tx.objectStore(store));
  } catch {
    saveFallback();
  }
}

function putPlayer(p: PlayerSave) {
  write('players', (os) => {
    const r = os.get(p.key) as IDBRequest<PlayerSave | undefined>;
    r.onsuccess = () => {
      const merged = mergePlayer(r.result, plain(p));
      // another tab may have opened more chapters
      p.unlockedChapter = merged.unlockedChapter;
      os.put(merged);
    };
  });
}

function putMeta(key: string, value: unknown) {
  write('meta', (os) => os.put(value, key));
}

function putBoard() {
  write('meta', (os) => {
    const r = os.get('board') as IDBRequest<ScoreEntry[] | undefined>;
    r.onsuccess = () => {
      board = mergeBoard(Array.isArray(r.result) ? r.result : [], board);
      os.put(board, 'board');
    };
  });
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
  if (Array.isArray(oldBoard)) board = mergeBoard([], oldBoard);
}

type Fallback = { players: PlayerSave[]; current: string; board: ScoreEntry[] };

async function load() {
  try {
    db = await Promise.race([
      openDb(),
      new Promise<never>((_r, rej) => setTimeout(() => rej(new Error('indexedDB timeout')), 2500)),
    ]);
  } catch {
    db = null;
  }
  const fb = readOld<Fallback>(FALLBACK);
  if (db) {
    db.onclose = () => { db = null; };
    db.onversionchange = () => { db?.close(); db = null; };
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
    let dirty = false;
    if (!migrated) {
      if (!list.length && !fb) migrateOld();
      putMeta('migrated', true);
      dirty = true;
    }
    // a copy kept while IndexedDB was unavailable: merge it in, then drop it
    if (fb) {
      for (const p of fb.players ?? []) players.set(p.key, mergePlayer(players.get(p.key), p));
      if (fb.current) currentKey = fb.current;
      board = mergeBoard(board, fb.board ?? []);
      dirty = true;
    }
    if (dirty) {
      for (const p of players.values()) putPlayer(p);
      putMeta('current', currentKey);
      putBoard();
      if (fb) {
        try { window.localStorage.removeItem(FALLBACK); } catch { /* ignore */ }
      }
    }
  } else if (fb) {
    for (const p of fb.players ?? []) players.set(p.key, p);
    currentKey = fb.current ?? currentKey;
    board = fb.board ?? [];
  } else migrateOld();
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
    board = mergeBoard(board, [entry]);
    putBoard();
    return board.findIndex((e) => scoreKey(e) === scoreKey(entry));
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

  /** The player's weapon, or null if he hasn't picked one yet. */
  getWeapon(): WeaponId | null {
    const w = current().weapon;
    return w === 'sword' || w === 'axe' ? w : null;
  },
  setWeapon(id: WeaponId) {
    const p = current();
    if (p.weapon === id) return;
    p.weapon = id;
    putPlayer(p);
  },

  /** Where the hero was last: the map puts him there, a death resumes from that level. */
  getSpot(): Spot | null {
    const at = current().at;
    return at ? { ...at } : null;
  },
  /** The hero is in this chapter (level -1 = its camp). A real level is also the chapter's resume point. */
  setSpot(chapter: number, level: number) {
    const p = current();
    if (chapter > p.unlockedChapter) return; // test shortcuts into locked chapters don't count
    const same = p.at && p.at.chapter === chapter && p.at.level === level;
    p.at = { chapter, level };
    if (level >= 0) p.resume = { ...(p.resume ?? {}), [chapter]: level };
    if (!same || level >= 0) putPlayer(p);
  },
  /** The chapter is done: next time it starts from the beginning. */
  clearResume(chapter: number) {
    const p = current();
    if (p.resume?.[chapter] === undefined) return;
    const r = { ...p.resume };
    delete r[chapter];
    p.resume = r;
    putPlayer(p);
  },
  /** The level to resume a chapter from (after its camp), if the hero stopped inside it. */
  resumeLevel(chapter: number): number | undefined {
    const l = current().resume?.[chapter];
    return typeof l === 'number' && l >= 0 ? l : undefined;
  },
};
