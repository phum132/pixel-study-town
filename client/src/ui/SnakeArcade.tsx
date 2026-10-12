import { useCallback, useEffect, useRef, useState } from 'react';
import { finishSnake, GRID, SnakeEngine, snakeTop, startSnake, TICK_MS, type Dir } from '../lib/snake';

const CELL = 16;
const SIZE = GRID * CELL;
// ใช้ e.code (ตำแหน่งปุ่ม) ไม่ใช่ e.key (ตัวอักษร) เพราะถ้าเปิดแป้นไทย กด W จะได้ "ไ"
const KEYS: Record<string, Dir> = {
  ArrowUp: 0, KeyW: 0,
  ArrowRight: 1, KeyD: 1,
  ArrowDown: 2, KeyS: 2,
  ArrowLeft: 3, KeyA: 3,
};

type Phase =
  | { kind: 'menu' }
  | { kind: 'starting' }
  | { kind: 'countdown'; n: number }
  | { kind: 'playing' }
  | { kind: 'checking'; clientScore: number }
  | { kind: 'result'; score: number; best: number; rejected: boolean }
  | { kind: 'error'; message: string };

function draw(ctx: CanvasRenderingContext2D, g: SnakeEngine | null) {
  // พื้นตาราง
  ctx.fillStyle = '#1d2b1f';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#223324';
  for (let y = 0; y < GRID; y++) for (let x = (y % 2); x < GRID; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  if (!g) return;

  // อาหาร (แอปเปิลพิกเซล)
  if (g.food >= 0) {
    const fx = (g.food % GRID) * CELL;
    const fy = Math.floor(g.food / GRID) * CELL;
    ctx.fillStyle = '#e04f5f';
    ctx.fillRect(fx + 3, fy + 4, 10, 10);
    ctx.fillRect(fx + 4, fy + 3, 8, 12);
    ctx.fillStyle = '#ff9aa5';
    ctx.fillRect(fx + 5, fy + 5, 2, 2);
    ctx.fillStyle = '#5a3d2b';
    ctx.fillRect(fx + 7, fy + 1, 2, 3);
  }

  // ตัวงู: หัวสีเข้มกว่า มีตา
  g.body.forEach((c, i) => {
    const x = (c % GRID) * CELL;
    const y = Math.floor(c / GRID) * CELL;
    const isHead = i === g.body.length - 1;
    ctx.fillStyle = isHead ? '#8be08b' : i % 2 ? '#5fbf6a' : '#4fae5c';
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    if (isHead) {
      ctx.fillStyle = '#1d2b1f';
      const [ex, ey] = [[5, 4], [11, 4], [5, 11], [4, 5]][g.dir];
      const vertical = g.dir === 0 || g.dir === 2;
      ctx.fillRect(x + ex, y + ey, 2, 2);
      ctx.fillRect(x + (vertical ? ex + 5 : ex), y + (vertical ? ey : ey + 6), 2, 2);
    }
  });
}

// ตู้เกม Snake: ฐานข้อมูลสุ่ม seed ให้ตอนเริ่ม และนับคะแนนเองตอนจบ (ดู 004_snake.sql)
export function SnakeArcade({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SnakeEngine | null>(null);
  const runRef = useRef<string>('');
  const queueRef = useRef<Dir[]>([]); // ปุ่มที่กดไว้ (ตาละ 1 ทิศ เก็บล่วงหน้าได้ 2 ทิศ)
  const [phase, setPhase] = useState<Phase>({ kind: 'menu' });
  const [score, setScore] = useState(0);
  const [top, setTop] = useState<{ username: string; best: number }[]>([]);

  const loadTop = useCallback(() => {
    snakeTop().then(setTop).catch(() => {});
  }, []);
  useEffect(loadTop, [loadTop]);

  useEffect(() => {
    draw(canvasRef.current!.getContext('2d')!, gameRef.current);
  }, [phase]);

  function press(d: Dir) {
    const g = gameRef.current;
    if (!g || g.dead) return;
    const q = queueRef.current;
    const last = q.length ? q[q.length - 1] : g.dir;
    if (q.length < 2 && d !== last && d !== (last + 2) % 4) q.push(d);
  }

  // คีย์บอร์ด: ลูกศร/WASD บังคับงู, Esc ปิด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      const d = KEYS[e.code];
      if (d !== undefined) {
        e.preventDefault();
        press(d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function start() {
    setPhase({ kind: 'starting' }); // ซ่อนปุ่มระหว่างรอ กันกดซ้ำ
    try {
      const { run_id, seed } = await startSnake();
      runRef.current = run_id;
      gameRef.current = new SnakeEngine(seed);
      queueRef.current = [];
      setScore(0);
      setPhase({ kind: 'countdown', n: 3 });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  // นับถอยหลัง 3-2-1
  useEffect(() => {
    if (phase.kind !== 'countdown') return;
    const id = setTimeout(() => setPhase(phase.n > 1 ? { kind: 'countdown', n: phase.n - 1 } : { kind: 'playing' }), 700);
    return () => clearTimeout(id);
  }, [phase]);

  // วนเกม: ทุก 110ms เดิน 1 ตา (ห้ามเร็วกว่านี้ ฐานข้อมูลจะไม่รับ)
  useEffect(() => {
    if (phase.kind !== 'playing') return;
    const ctx = canvasRef.current!.getContext('2d')!;
    let done = false;

    // จบเกม: หยุดนาฬิกา แล้วส่งการกดปุ่มให้ฐานข้อมูลนับคะแนน (เรียกได้ครั้งเดียว)
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(id);
      const g = gameRef.current!;
      g.dead = true;
      setPhase({ kind: 'checking', clientScore: g.score });
      finishSnake(runRef.current, g.inputs)
        .then((r) => {
          setPhase({ kind: 'result', score: r.score, best: r.best, rejected: r.rejected });
          loadTop();
        })
        .catch((err) => setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) }));
    };

    const id = setInterval(() => {
      const g = gameRef.current!;
      g.step(queueRef.current.shift());
      draw(ctx, g);
      setScore(g.score);
      if (g.dead) finish();
    }, TICK_MS);

    // สลับแท็บ/สลับแอประหว่างเล่น: เบราว์เซอร์จะชะลอหรือหยุดเกม ทำให้เวลาไม่ตรงและคะแนนไม่ผ่าน
    // จึงจบเกมและส่งคะแนนทันที (มือถือหยุด JavaScript ทั้งหมดตอนอยู่เบื้องหลัง รอรอบถัดไปไม่ได้)
    const onHide = () => {
      if (document.hidden) finish();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [phase.kind, loadTop]);

  // มือถือ: ปัดนิ้วบนกระดาน
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  };

  const playing = phase.kind === 'playing' || phase.kind === 'countdown';

  return (
    <div className="modal-backdrop">
      <div className={`arcade ${playing ? 'playing' : ''}`}>
        <header>
          <strong>🐍 Pixel Snake</strong>
          <span className="arcade-score">คะแนน {score}</span>
          <button onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </header>

        <div className="arcade-main">
          <div className="arcade-screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <canvas ref={canvasRef} width={SIZE} height={SIZE} className="pixel" />
            {phase.kind !== 'playing' && (
              <div className="arcade-overlay">
                {phase.kind === 'menu' && (
                  <>
                    <p>กินแอปเปิลให้ได้มากที่สุด ห้ามชนขอบและตัวเอง</p>
                    <p className="muted">ลูกศร / WASD • มือถือ: ปัดนิ้ว</p>
                    <button className="primary" onClick={start}>
                      เริ่มเกม
                    </button>
                  </>
                )}
                {phase.kind === 'starting' && <p>กำลังเตรียมกระดาน...</p>}
                {phase.kind === 'countdown' && <p className="arcade-count">{phase.n}</p>}
                {phase.kind === 'checking' && <p>กำลังตรวจคะแนน... 🔍</p>}
                {phase.kind === 'result' && (
                  <>
                    {phase.rejected ? (
                      <p className="error">คะแนนไม่ผ่านการตรวจ (เวลาเล่นไม่ตรง) ได้ 0 คะแนน</p>
                    ) : (
                      <p className="arcade-count">{phase.score}</p>
                    )}
                    <p className="success">✅ ฐานข้อมูลตรวจแล้ว • สถิติของคุณ {phase.best}</p>
                    <button className="primary" onClick={start}>
                      เล่นอีกครั้ง
                    </button>
                  </>
                )}
                {phase.kind === 'error' && (
                  <>
                    <p className="error">{phase.message}</p>
                    <button className="primary" onClick={start}>
                      ลองใหม่
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="arcade-top">
            <strong>🏆 10 อันดับ</strong>
            {top.length === 0 && <p className="muted">ยังไม่มีใครเล่น เป็นคนแรกเลย!</p>}
            <ol>
              {top.map((t) => (
                <li key={t.username}>
                  <span>{t.username}</span>
                  <b>{t.best}</b>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        {/* ปุ่มทิศสำหรับมือถือ */}
        <div className={`dpad ${playing ? '' : 'dim'}`}>
          <button onClick={() => press(0)}>▲</button>
          <div>
            <button onClick={() => press(3)}>◀</button>
            <button onClick={() => press(2)}>▼</button>
            <button onClick={() => press(1)}>▶</button>
          </div>
        </div>
      </div>
    </div>
  );
}
