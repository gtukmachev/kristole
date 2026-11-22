import Phaser from 'phaser';
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
  private editingName = false;
  private t = 0;
  private editStartedAt = 0;

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

    this.add.text(600, 420, 'Rename: type letters, Enter to finish.\nHeadgear: ← → to change.', { fontFamily: FONT_SLAB, fontSize: '18px', color: hex(MENU_PALE), lineSpacing: 6 });

    const gearItem = { ...buttonItem(gearBtn), left: () => this.cycleGear(-1), right: () => this.cycleGear(1) };
    new GridNav(this, [[buttonItem(nameBtn)], [gearItem], [buttonItem(back)]], () => this.leave(), () => this.editingName);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (!this.editingName || performance.now() - this.editStartedAt < 60) return;
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
    this.editingName = !this.editingName;
    if (this.editingName) {
      this.profile.name = '';
      this.editStartedAt = performance.now();
    } else {
      if (!this.profile.name.trim()) this.profile.name = 'PLAYER';
      storage.setProfile(this.profile);
    }
    this.refresh();
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
    this.scene.start('Menu');
  }

  update(_t: number, dms: number) {
    this.t += dms / 1000;
    const g = this.preview;
    g.clear();
    const b = Math.sin(this.t * 3) * 0.04;
    drawFigure(g, 300, 520, 1, 2.4, { ...PREVIEW_POSE, lean: PREVIEW_POSE.lean + b, weapon: PREVIEW_POSE.weapon + b * 2 }, {
      kind: 'player',
      weapon: 'sword',
      headgear: this.profile.headgear,
      time: this.t,
    });
    if (this.editingName) this.refresh();
  }

}
