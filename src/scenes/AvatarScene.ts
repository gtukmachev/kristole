import Phaser from 'phaser';
import { hint as keyHint, isTouch } from '../game/touch';
import { menuScene } from '../game/menuChoice';
import { FONT_IMPACT, FONT_SLAB, MENU_ORANGE, MENU_PALE, MENU_WHITE, MENU_YELLOW, PAPER, WIDTH, hex } from '../game/constants';
import { drawFigure, pose } from '../game/figure';
import { sfx } from '../game/sfx';
import { storage, type Headgear, type Profile } from '../game/storage';
import { GridNav, buttonItem, makeButton } from '../game/ui';
import { menuBackdrop } from './MenuScene';

const HEADGEAR: { id: Headgear; label: string }[] = [
  { id: 'headband', label: 'Headband' },
  { id: 'hood', label: 'Hood' },
  { id: 'hat', label: 'Hat' },
  { id: 'none', label: 'Nothing' },
];

const PREVIEW_POSE = pose({ lean: 0.06, fThigh: 0.2, fShin: 0.05, bThigh: -0.2, bShin: -0.08, fUpper: 0.55, fFore: 1.45, bUpper: -0.25, bFore: 0.35, weapon: 1.75 });

export class AvatarScene extends Phaser.Scene {
  private profile!: Profile;
  private preview!: Phaser.GameObjects.Graphics;
  private nameText!: Phaser.GameObjects.Text;
  private gearText!: Phaser.GameObjects.Text;
  private editEndedAt = -1e9;
  private nameInput?: HTMLInputElement;
  private editingName = false;
  private t = 0;
  private editStartedAt = 0;
  private nameBefore = 'PLAYER';
  private switchText?: Phaser.GameObjects.Text;

  constructor() {
    super('Avatar');
  }

  create() {
    sfx.playMusic('menu');
    this.profile = storage.getProfile();
    menuBackdrop(this);
    this.add.text(WIDTH / 2, 60, 'AVATAR', { fontFamily: FONT_IMPACT, fontSize: '64px', color: hex(MENU_ORANGE) }).setOrigin(0.5);

    // Preview on a paper card, the way the fighter looks in the game.
    const card = this.add.graphics();
    card.fillStyle(PAPER, 1);
    card.fillRect(140, 150, 360, 420);
    card.lineStyle(5, MENU_WHITE, 1);
    card.strokeRect(140, 150, 360, 420);
    card.lineStyle(4, 0x111111, 1);
    card.lineBetween(160, 520, 480, 520);
    this.preview = this.add.graphics();

    const label = (y: number, s: string) =>
      this.add.text(600, y, s, { fontFamily: FONT_SLAB, fontSize: '20px', color: '#aaaaaa' });
    label(170, 'NAME (for the leaderboard)');
    this.nameText = this.add.text(600, 200, '', { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '44px', color: hex(MENU_YELLOW) });
    label(300, 'HEADGEAR');
    this.gearText = this.add.text(600, 330, '', { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '44px', color: hex(MENU_YELLOW) });

    const nameBtn = makeButton(this, { x: 1020, y: 228, w: 200, h: 64, label: 'Rename', fontSize: 28, onClick: () => this.toggleEdit() });
    const gearBtn = makeButton(this, { x: 1020, y: 358, w: 200, h: 64, label: '◀  ▶', fontSize: 28, onClick: () => this.cycleGear(1) });
    const back = makeButton(this, { x: 800, y: 520, w: 260, h: 80, label: 'Done', fontSize: 38, onClick: () => this.leave() });

    this.add.text(600, 420, keyHint('Rename: type letters, Enter to finish.\nHeadgear: ← → to change.', 'Rename: tap Rename, type, then Done on the keyboard.\nHeadgear: tap ◀ ▶ to change.'), { fontFamily: FONT_SLAB, fontSize: '18px', color: hex(MENU_PALE), lineSpacing: 6 });

    const gearItem = { ...buttonItem(gearBtn), left: () => this.cycleGear(-1), right: () => this.cycleGear(1) };
    new GridNav(this, [[buttonItem(nameBtn)], [gearItem], [buttonItem(back)]], () => this.leave(), () => this.editingName);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (!this.editingName || this.nameInput || performance.now() - this.editStartedAt < 60) return;
      if (e.key === 'Enter' || e.key === 'Escape') {
        this.toggleEdit();
      } else if (e.key === 'Backspace') {
        this.profile.name = this.profile.name.slice(0, -1);
      } else if (/^[a-zA-Z0-9 _-]$/.test(e.key) && this.profile.name.length < 12) {
        this.profile.name += e.key.toUpperCase();
        sfx.click();
      }
      this.refresh();
    });
    this.refresh();
  }

  private toggleEdit() {
    // phone: a tap on "Rename" first blurs the text field (that ends the edit) — don't start a new one
    if (!this.editingName && performance.now() - this.editEndedAt < 500) return;
    if (this.editingName) this.editEndedAt = performance.now();
    this.editingName = !this.editingName;
    if (this.editingName) {
      this.nameBefore = this.profile.name;
      this.profile.name = '';
      this.editStartedAt = performance.now();
      if (isTouch()) this.openNameInput();
    } else {
      this.closeNameInput();
      if (!this.profile.name.trim()) this.profile.name = this.nameBefore;
      // a new name = a new player; a known name loads that player
      const r = storage.setProfile(this.profile);
      if (r !== 'same') this.showSwitch(r === 'loaded');
      this.profile = storage.getProfile();
    }
    this.refresh();
  }

  /**
   * Phones have no keyboard until a text field gets focus: an (almost invisible) input over the name
   * brings up the phone keyboard. Focus must happen inside the tap, so this runs from the button handler.
   */
  private openNameInput() {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = 12;
    el.autocapitalize = 'characters';
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.enterKeyHint = 'done';
    Object.assign(el.style, { position: 'fixed', left: '50%', top: '30%', width: '200px', fontSize: '16px', opacity: '0.01', zIndex: '10' });
    document.body.appendChild(el);
    this.nameInput = el;
    el.addEventListener('input', () => {
      const v = el.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 12);
      if (v !== el.value) el.value = v;
      this.profile.name = v;
      this.refresh();
    });
    const finish = () => {
      if (this.nameInput === el && this.editingName) this.toggleEdit();
    };
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish();
    });
    el.addEventListener('blur', finish);
    el.focus();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.closeNameInput());
  }

  private closeNameInput() {
    const el = this.nameInput;
    if (!el) return;
    this.nameInput = undefined;
    el.blur();
    el.remove();
  }

  private showSwitch(known: boolean) {
    this.switchText?.destroy();
    this.switchText = this.add.text(600, 262, known ? 'Welcome back! Your progress is loaded.' : 'New player — a fresh start!', {
      fontFamily: FONT_SLAB, fontSize: '20px', color: hex(MENU_PALE),
    });
  }

  private cycleGear(d: number) {
    const i = HEADGEAR.findIndex((h) => h.id === this.profile.headgear);
    this.profile.headgear = HEADGEAR[(i + d + HEADGEAR.length) % HEADGEAR.length].id;
    storage.setProfile(this.profile);
    sfx.click();
    this.refresh();
  }

  private refresh() {
    const cursor = this.editingName ? (Math.floor(this.t * 2) % 2 ? '_' : ' ') : '';
    this.nameText.setText(this.profile.name + cursor);
    this.gearText.setText(HEADGEAR.find((h) => h.id === this.profile.headgear)!.label);
  }

  private leave() {
    if (this.editingName) return;
    storage.setProfile(this.profile);
    this.scene.start(menuScene());
  }

  update(_t: number, dms: number) {
    this.t += dms / 1000;
    const g = this.preview;
    g.clear();
    const b = Math.sin(this.t * 3) * 0.04;
    drawFigure(g, 300, 520, 1, 2.4, { ...PREVIEW_POSE, lean: PREVIEW_POSE.lean + b, weapon: PREVIEW_POSE.weapon + b * 2 }, {
      kind: 'player',
      weapon: storage.getWeapon() ?? 'sword',
      headgear: this.profile.headgear,
      time: this.t,
    });
    if (this.editingName) this.refresh();
  }

}
