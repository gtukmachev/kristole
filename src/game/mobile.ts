/**
 * Phones and tablets: full screen like a video player, and the "Add to Home Screen" hint on iPhone.
 *  - Android / iPad: the first tap asks the browser for full screen (it only allows that inside a tap)
 *    and turns the screen lock to landscape. Left full screen? The next tap goes back.
 *  - iPhone Safari can't put a page in full screen; installed on the Home Screen the game opens
 *    without the browser bars, so we show how to do that, right away.
 */
import { isTouch } from './touch';

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = document as FsDoc;

/** Opened from the Home Screen icon (no browser bars anyway). */
function installed(): boolean {
  return (
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function fullscreenAvailable(): boolean {
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

function isFullscreen(): boolean {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

function goFullscreen() {
  const el = document.documentElement as FsEl;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
    Promise.resolve(p)
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
      .catch(() => {
        /* not allowed here: fine */
      });
  } catch {
    /* ignore */
  }
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function setupMobile() {
  if (new URLSearchParams(window.location.search).has('nofs')) return;
  // full screen on a tap (touch only: on a computer the window stays as it is)
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || installed() || isFullscreen() || !fullscreenAvailable()) return;
    goFullscreen();
  }, { capture: true });

  // iPhone: how to get full screen
  const bar = document.getElementById('install');
  if (bar && isTouch() && isIos() && !installed() && !fullscreenAvailable()) {
    let closed = false;
    try {
      closed = window.sessionStorage.getItem('kristole.installHint') === 'closed';
    } catch {
      /* ignore */
    }
    if (!closed) {
      bar.style.display = 'flex';
      bar.querySelector('button')?.addEventListener('click', () => {
        bar.style.display = 'none';
        try {
          window.sessionStorage.setItem('kristole.installHint', 'closed');
        } catch {
          /* ignore */
        }
      });
    }
  }
}
