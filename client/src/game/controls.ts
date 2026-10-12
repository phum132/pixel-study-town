import Phaser from 'phaser';
import type { Dir } from './avatar';

// การบังคับตัวละคร (ใช้ร่วมกันทั้งเมือง บ้าน และด่านผจญภัย): ลูกศร/WASD หรือกดค้างบนจอให้เดินไปทางนิ้ว
export type MoveKeys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

// false = ไม่แย่งปุ่มจากเบราว์เซอร์ จะได้พิมพ์ตัว w a s d ในช่องแชทได้
export function addMoveKeys(scene: Phaser.Scene): MoveKeys {
  const kb = scene.input.keyboard!;
  const key = (k: string) => kb.addKey(k, false);
  return {
    up: key('UP'), down: key('DOWN'), left: key('LEFT'), right: key('RIGHT'),
    w: key('W'), a: key('A'), s: key('S'), d: key('D'),
  };
}

// ทิศที่อยากเดิน (ยังไม่ได้ทำให้ยาว 1) / keyboard = false ตอนกำลังพิมพ์ / pointer = false ตอนใช้เมาส์ทำอย่างอื่น
export function readMove(scene: Phaser.Scene, keys: MoveKeys, from: { x: number; y: number }, keyboard: boolean, pointer: boolean) {
  let dx = 0;
  let dy = 0;
  if (keyboard) {
    dx = (keys.right.isDown || keys.d.isDown ? 1 : 0) - (keys.left.isDown || keys.a.isDown ? 1 : 0);
    dy = (keys.down.isDown || keys.s.isDown ? 1 : 0) - (keys.up.isDown || keys.w.isDown ? 1 : 0);
  }
  const p = scene.input.activePointer;
  if (pointer && dx === 0 && dy === 0 && p.isDown) {
    const ox = p.worldX - from.x;
    const oy = p.worldY - from.y;
    if (Math.hypot(ox, oy) > 6) {
      dx = ox;
      dy = oy;
    }
  }
  return { dx, dy };
}

// ทิศที่หันหน้าตามทางที่เดิน
export function dirOf(dx: number, dy: number): Dir {
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy > 0 ? 'down' : 'up';
}

// พิมพ์อยู่ในช่องแชท/ฟอร์ม = ปุ่มคีย์บอร์ดไม่ใช่ของตัวละคร
export function typingInForm() {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
}
