import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { TownScene } from './TownScene';
import type { CharacterColors } from './character';

type Props = { colors: CharacterColors; name: string; room: Room };

// กล่อง React ที่สร้างเกม Phaser ไว้ข้างใน และลบเกมทิ้งเมื่อออกจากหน้า
export function PhaserGame({ colors, name, room }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current!,
      width: 800,
      height: 480,
      backgroundColor: '#2b2140',
      pixelArt: true, // ไม่เบลอภาพพิกเซลตอนขยาย
      physics: { default: 'arcade' },
      audio: { noAudio: true }, // เพลง lofi จะเล่นผ่านเครื่องเล่นแยก (Phase 6)
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    game.scene.add('TownScene', TownScene, true, { colors, name, room });
    return () => game.destroy(true);
  }, [colors, name, room]);

  return <div ref={containerRef} className="game" />;
}
