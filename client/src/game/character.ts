import Phaser from 'phaser';

// วาดตัวละครพิกเซล 16x16 ด้วยโค้ด (ชุดภาพ Tiny Town ไม่มีตัวละคร)
// เฟรม: 0-2 หันหน้า, 3-5 หันหลัง, 6-8 หันขวา (หันซ้ายใช้ภาพหันขวาแล้วกลับด้าน)
// แต่ละทิศ: เฟรมแรก = ยืน, สองเฟรมถัดไป = ก้าวขาซ้าย/ขวา

export type CharacterColors = {
  hair: string;
  skin: string;
  shirt: string;
  pants: string;
};

export const DEFAULT_COLORS: CharacterColors = {
  hair: '#6b3f2a',
  skin: '#f2c79b',
  shirt: '#4f8fd1',
  pants: '#3d4a6b',
};

// สีที่ให้ผู้เล่นเลือกในหน้าสร้างตัวละคร
export const PALETTES: Record<keyof CharacterColors, string[]> = {
  hair: ['#6b3f2a', '#2b2140', '#d9a441', '#c4553b', '#e8e2d0', '#7a5cc4', '#3f8f6b', '#e07ab0'],
  skin: ['#f2c79b', '#e0a878', '#b97a4f', '#8a5634', '#ffe0c7'],
  shirt: ['#4f8fd1', '#d14f5e', '#4fb874', '#e0b84a', '#8b5fc9', '#f08a3c', '#eeeeee', '#3a3a4a'],
  pants: ['#3d4a6b', '#2b2b33', '#6b4a3d', '#4a6b3d', '#8a8a99', '#6b3d5e'],
};

const OUTLINE = '#2b1d26';
const EYE = '#2b2140';
const SIZE = 16;

type Part = [x: number, y: number, w: number, h: number, color: string];
type Dir = 'down' | 'up' | 'side';

// คืนค่าเป็นกลุ่ม (ขา, ลำตัว, หัว) แต่ละกลุ่มจะมีเส้นขอบของตัวเอง จะได้เห็นรอยต่อคอ/เอว
function parts(dir: Dir, step: number, c: CharacterColors): Part[][] {
  // ก้าวขา: ขาที่ยกจะสั้นลง และแขนแกว่งสลับกัน
  const leftLeg = step === 1 ? 1 : 3;
  const rightLeg = step === 2 ? 1 : 3;
  const leftArm = step === 2 ? 1 : 0;
  const rightArm = step === 1 ? 1 : 0;

  if (dir === 'side') {
    const back = step === 0 ? 6 : 5;
    const front = step === 0 ? 8 : 9;
    return [
      [[back, 12, 2, step === 2 ? 2 : 3, c.pants], [front, 12, 2, step === 1 ? 2 : 3, c.pants]],
      [[5, 8, 6, 4, c.shirt], [7, 9 + (step === 0 ? 0 : 1), 2, 2, c.skin]],
      [[4, 1, 8, 6, c.skin], [4, 1, 8, 2, c.hair], [4, 1, 3, 5, c.hair], [10, 4, 1, 1, EYE]],
    ];
  }

  const legs: Part[] = [[5, 12, 2, leftLeg, c.pants], [9, 12, 2, rightLeg, c.pants]];
  const torso: Part[] = [
    [4, 8, 8, 4, c.shirt],
    [3, 8 + leftArm, 1, 3, c.skin],
    [12, 8 + rightArm, 1, 3, c.skin],
  ];
  const head: Part[] =
    dir === 'down'
      ? [[4, 1, 8, 6, c.skin], [4, 1, 8, 2, c.hair], [4, 1, 1, 4, c.hair], [11, 1, 1, 4, c.hair], [6, 4, 1, 1, EYE], [9, 4, 1, 1, EYE]]
      : [[4, 1, 8, 6, c.hair]];
  return [legs, torso, head];
}

const DIRS: Dir[] = ['down', 'up', 'side'];

// วาดภาพทั้ง 9 เฟรมเรียงกันลงบน canvas (กว้าง 144 สูง 16) ใช้ทั้งในเกมและหน้าเลือกตัวละคร
export function drawCharacterSheet(ctx: CanvasRenderingContext2D, colors: CharacterColors) {
  ctx.clearRect(0, 0, SIZE * 9, SIZE);
  DIRS.forEach((dir, d) => {
    for (let step = 0; step < 3; step++) {
      const ox = (d * 3 + step) * SIZE;
      // ทีละกลุ่ม: วาดขอบสีเข้มรอบทุกชิ้นก่อน แล้วค่อยลงสี จะได้เส้นขอบแบบภาพพิกเซล
      for (const group of parts(dir, step, colors)) {
        ctx.fillStyle = OUTLINE;
        for (const [x, y, w, h] of group) ctx.fillRect(ox + x - 1, y - 1, w + 2, h + 2);
        for (const [x, y, w, h, color] of group) {
          ctx.fillStyle = color;
          ctx.fillRect(ox + x, y, w, h);
        }
      }
    }
  });
}

export function createCharacterTexture(scene: Phaser.Scene, key: string, colors = DEFAULT_COLORS) {
  if (scene.textures.exists(key)) return;

  const canvas = scene.textures.createCanvas(key, SIZE * 9, SIZE)!;
  drawCharacterSheet(canvas.getContext(), colors);
  for (let i = 0; i < 9; i++) canvas.add(i, 0, i * SIZE, 0, SIZE, SIZE);
  canvas.refresh();

  const anims: [string, number][] = [['down', 0], ['up', 3], ['side', 6]];
  for (const [name, start] of anims) {
    scene.anims.create({
      key: `${key}-walk-${name}`,
      frames: [start + 1, start, start + 2, start].map((frame) => ({ key, frame })),
      frameRate: 8,
      repeat: -1,
    });
  }
}
