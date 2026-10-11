import { useEffect, useRef } from 'react';
import { drawCharacterSheet, type CharacterColors } from '../game/character';

const WALK = [1, 0, 2, 0];
const DIR_START = [0, 6, 3, 6]; // หน้า → ขวา → หลัง → ซ้าย (หมุนโชว์รอบตัว)

// แสดงตัวละครเดินอยู่กับที่ หมุนทิศทุก 2 วินาที
export function CharacterPreview({ colors, scale = 6 }: { colors: CharacterColors; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sheet = document.createElement('canvas');
    sheet.width = 16 * 9;
    sheet.height = 16;
    drawCharacterSheet(sheet.getContext('2d')!, colors);

    const ctx = ref.current!.getContext('2d')!;
    let tick = 0;
    const draw = () => {
      const dir = Math.floor(tick / 16) % 4;
      const frame = DIR_START[dir] + WALK[tick % 4];
      ctx.save();
      ctx.clearRect(0, 0, 16, 16);
      if (dir === 3) {
        ctx.translate(16, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(sheet, frame * 16, 0, 16, 16, 0, 0, 16, 16);
      ctx.restore();
      tick++;
    };
    draw();
    const id = setInterval(draw, 125);
    return () => clearInterval(id);
  }, [colors]);

  return <canvas ref={ref} width={16} height={16} className="pixel" style={{ width: 16 * scale, height: 16 * scale }} />;
}
