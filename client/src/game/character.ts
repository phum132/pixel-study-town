import Phaser from 'phaser';
import { CHARACTERS, DIR_COLUMN } from '../lib/characters';

export const textureKey = (name: string) => `char-${name}`;

// โหลดแผ่นภาพตัวละครทุกตัว (ตัวละ 1-2 KB รวมแล้วเล็กมาก) เรียกใน preload() ของฉาก
export function preloadCharacters(scene: Phaser.Scene) {
  for (const name of CHARACTERS) {
    const key = textureKey(name);
    if (!scene.textures.exists(key)) {
      scene.load.spritesheet(key, `assets/characters/${name}.png`, { frameWidth: 16, frameHeight: 16 });
    }
  }
}

// สร้างท่าเดิน 4 ทิศ: เฟรมของทิศหนึ่งอยู่ในคอลัมน์เดียวกัน แถว 0-3
export function ensureWalkAnims(scene: Phaser.Scene, name: string) {
  const key = textureKey(name);
  for (const [dir, col] of Object.entries(DIR_COLUMN)) {
    const animKey = `${key}-walk-${dir}`;
    if (scene.anims.exists(animKey)) continue;
    scene.anims.create({
      key: animKey,
      frames: [0, 1, 2, 3].map((row) => ({ key, frame: row * 4 + col })),
      frameRate: 8,
      repeat: -1,
    });
  }
}
