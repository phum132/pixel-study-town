import { useEffect, useRef } from 'react';
import { drawFurniture, type Furniture } from '../lib/furniture';
import { loadFurnitureSheets } from '../lib/home';

// ไอคอนเฟอร์นิเจอร์ในหน้าแต่งห้อง (ชิ้นเล็กขยาย 2 เท่า ชิ้นใหญ่ขนาดจริง)
export function FurnitureIcon({ item }: { item: Furniture }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = Math.max(item.w, item.h) === 1 ? 2 : 1;

  useEffect(() => {
    let alive = true;
    loadFurnitureSheets().then((sheets) => {
      const ctx = ref.current?.getContext('2d');
      if (!alive || !ctx) return;
      ctx.clearRect(0, 0, item.w * 16, item.h * 16);
      drawFurniture(ctx, item, sheets);
    });
    return () => {
      alive = false;
    };
  }, [item]);

  return (
    <canvas
      ref={ref}
      width={item.w * 16}
      height={item.h * 16}
      className="pixel"
      style={{ width: item.w * 16 * scale, height: item.h * 16 * scale }}
    />
  );
}
