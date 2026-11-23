/**
 * Floating key log for hunting keyboard problems: open the game with `?keys` (or press F9 to toggle).
 * Shows every key press (key / code / keyCode) and what the game did with it.
 */
const MAX = 10;
let panel: HTMLDivElement | null = null;
const lines: string[] = [];

function render() {
  if (!panel) return;
  panel.textContent = ['KEY LOG (F9 hides)', ...lines].join('\n');
}

function show(on: boolean) {
  if (on && !panel) {
    panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '1000', padding: '8px 10px',
      background: 'rgba(255,255,255,0.92)', color: '#111', border: '2px solid #111', borderRadius: '6px',
      font: '13px/1.35 Menlo, Consolas, monospace', whiteSpace: 'pre', pointerEvents: 'none', maxWidth: '96vw',
    });
    document.body.appendChild(panel);
    render();
  } else if (!on && panel) {
    panel.remove();
    panel = null;
  }
}

/** Adds a line to the log (no-op when the panel is hidden). */
export function keyLog(msg: string) {
  if (!panel) return;
  lines.push(msg);
  if (lines.length > MAX) lines.shift();
  render();
}

export function installKeyDebug() {
  show(new URLSearchParams(window.location.search).has('keys'));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F9') {
      show(!panel);
      return;
    }
    keyLog(`down  key=${JSON.stringify(e.key)}  code=${e.code || '-'}  keyCode=${e.keyCode}${e.repeat ? '  (repeat)' : ''}${e.shiftKey ? '  +shift' : ''}`);
  }, true);
  (window as unknown as { __keyLog: typeof keyLog }).__keyLog = keyLog;
}
