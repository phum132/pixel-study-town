import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { TownScene } from './TownScene';
import { HomeScene } from './HomeScene';
import { AdventureScene, type AdventureInit } from './AdventureScene';
import { SurvivorScene, type SurvivorInit } from './SurvivorScene';
import type { WorldInit } from './WorldScene';

type Props =
  | { scene: 'town' | 'home'; init: WorldInit }
  | { scene: 'adventure'; init: AdventureInit }
  | { scene: 'survivor'; init: SurvivorInit };

// กล่อง React ที่สร้างเกม Phaser ไว้ข้างใน และลบเกมทิ้งเมื่อออกจากหน้า
// ใช้ข้อมูล init ชุดแรกเท่านั้น (ข้อมูลที่เปลี่ยนระหว่างเล่นส่งผ่าน bridge แทน)
// ถ้าต้องการเริ่มเกมใหม่ ให้ตัวที่เรียกใช้เปลี่ยน key ของ component นี้
export function PhaserGame({ scene, init }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(init);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current!,
      width: 800,
      height: 480,
      backgroundColor: '#1a1424',
      pixelArt: true, // ไม่เบลอภาพพิกเซลตอนขยาย
      physics: { default: 'arcade' },
      audio: { noAudio: true }, // เพลง lofi จะเล่นผ่านเครื่องเล่นแยก (Phase 6)
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    if (scene === 'town') game.scene.add('TownScene', TownScene, true, initial);
    else if (scene === 'home') game.scene.add('HomeScene', HomeScene, true, initial);
    else if (scene === 'adventure') game.scene.add('AdventureScene', AdventureScene, true, initial);
    else game.scene.add('SurvivorScene', SurvivorScene, true, initial);
    return () => game.destroy(true);
  }, [scene, initial]);

  return <div ref={containerRef} className="game" />;
}
