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

const PROFILE_KEY = 'kristole.profile';
const BOARD_KEY = 'kristole.leaderboard';
const PROGRESS_KEY = 'kristole.progress';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: progress just isn't kept */
  }
}

export const storage = {
  getProfile(): Profile {
    return read<Profile>(PROFILE_KEY, { name: 'PLAYER', headgear: 'headband' });
  },
  setProfile(p: Profile) {
    write(PROFILE_KEY, p);
  },
  getBoard(): ScoreEntry[] {
    return readArray<ScoreEntry>(BOARD_KEY)
      .filter((e) => typeof e.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  },
  /** Adds a score, returns its rank (0-based) or -1 if it didn't make the top 10. */
  addScore(entry: ScoreEntry): number {
    const board = readArray<ScoreEntry>(BOARD_KEY);
    board.push(entry);
    board.sort((a, b) => b.score - a.score);
    const top = board.slice(0, 10);
    write(BOARD_KEY, top);
    return top.indexOf(entry);
  },
  getProgress(): Progress {
    return read<Progress>(PROGRESS_KEY, { unlockedChapter: 0 });
  },
  unlockChapter(idx: number) {
    const p = storage.getProgress();
    if (idx > p.unlockedChapter) write(PROGRESS_KEY, { ...p, unlockedChapter: idx });
  },
};
