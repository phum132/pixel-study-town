import { useEffect, useRef } from 'react';
import { DIR_COLUMN, sheetUrl } from '../lib/characters';

const TURN = [DIR_COLUMN.down, DIR_COLUMN.right, DIR_COLUMN.up, DIR_COLUMN.left]; // หมุนโชว์รอบตัว

// ตัวละครเดินอยู่กับที่ หมุนทิศทุก 2 วินาที (ใช้ในหน้าเลือกตัวละคร)
export function CharacterPreview({ character, scale = 6 }: { character: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = new Image();
    img.src = sheetUrl(character);
    const ctx = ref.current!.getContext('2d')!;
    let tick = 0;
    const draw = () => {
      if (!img.complete) return;
      const col = TURN[Math.floor(tick / 16) % 4];
      const row = tick % 4;
      ctx.clearRect(0, 0, 16, 16);
      ctx.drawImage(img, col * 16, row * 16, 16, 16, 0, 0, 16, 16);
      tick++;
    };
    img.onload = draw;
    const id = setInterval(draw, 125);
    return () => clearInterval(id);
  }, [character]);

  return <canvas ref={ref} width={16} height={16} className="pixel" style={{ width: 16 * scale, height: 16 * scale }} />;
}
