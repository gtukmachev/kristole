/**
 * Service panel: floating key log for hunting keyboard problems. Only with `?debug=true` in the URL.
 * Shows every key press (key / code / keyCode) and what the game did with it.
 */
const MAX = 10;
let panel: HTMLDivElement | null = null;
const lines: string[] = [];

function render() {
  if (!panel) return;
  panel.textContent = ['KEY LOG (debug)', ...lines].join('\n');
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
  if (new URLSearchParams(window.location.search).get('debug') !== 'true') return;
  show(true);
  window.addEventListener('keydown', (e) => {
    keyLog(`down  key=${JSON.stringify(e.key)}  code=${e.code || '-'}  keyCode=${e.keyCode}${e.repeat ? '  (repeat)' : ''}${e.shiftKey ? '  +shift' : ''}`);
  }, true);
  (window as unknown as { __keyLog: typeof keyLog }).__keyLog = keyLog;
}

/**
 * Debug perk strip (only with `?debug=true`): a row of circles at the bottom of the screen,
 * one per perk slot; a click gives one more perk of that kind. Returns a remover.
 */
export function installPerkDebug(perks: { key: string; name: string }[], give: (slot: number) => void): () => void {
  if (new URLSearchParams(window.location.search).get('debug') !== 'true') return () => {};
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed', left: '50%', bottom: '8px', transform: 'translateX(-50%)', zIndex: '1001',
    display: 'flex', gap: '6px', padding: '6px 8px', background: 'rgba(255,255,255,0.85)',
    border: '2px solid #111', borderRadius: '22px', userSelect: 'none', touchAction: 'manipulation',
  });
  const circle = (label: string, title: string, onTap: () => void) => {
    const b = document.createElement('div');
    b.textContent = label;
    b.title = title;
    Object.assign(b.style, {
      width: '30px', height: '30px', borderRadius: '50%', border: '2px solid #111', background: '#f08a1c',
      color: '#111', font: 'bold 14px/30px Menlo, Consolas, monospace', textAlign: 'center', cursor: 'pointer',
    });
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onTap();
      b.style.background = '#ffd24a';
      setTimeout(() => (b.style.background = '#f08a1c'), 120);
    });
    bar.appendChild(b);
  };
  perks.forEach((p, i) => circle(p.key, `+1 ${p.name}`, () => give(i)));
  circle('∀', '+1 of every perk', () => perks.forEach((_p, i) => give(i)));
  document.body.appendChild(bar);
  return () => bar.remove();
}
