/** Which main menu is shown: the v7 world map (default) or the classic one. */
const KEY = 'kristole.menu';

export type MenuKind = 'map' | 'classic';

export const isDebug = () => new URLSearchParams(window.location.search).get('debug') === 'true';

export function menuKind(): MenuKind {
  try {
    return window.localStorage.getItem(KEY) === 'classic' ? 'classic' : 'map';
  } catch {
    return 'map';
  }
}

export function setMenuKind(k: MenuKind) {
  try {
    window.localStorage.setItem(KEY, k);
  } catch {
    /* ignore */
  }
}

/** Scene key of the chosen main menu. */
export const menuScene = () => (menuKind() === 'map' ? 'MapMenu' : 'Menu');
