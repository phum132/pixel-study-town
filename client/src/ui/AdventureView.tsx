import { useEffect, useState } from 'react';
import type { Profile } from '../lib/profile';
import { fetchBest, leaderboard, LEVELS, pointsOf, STAGES, type Best, type Level, type Rank, type Subject } from '../lib/adventure';
import { CHARACTERS } from '../lib/characters';
import { Faceset } from './Faceset';
import { AdventurePlay } from './AdventurePlay';

const LEVEL_KEY = 'pst-adv-level';
function savedLevel(): Level {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === 'lower' || v === 'upper' || v === 'uni') return v;
  } catch {
    // เบราว์เซอร์ไม่ให้ใช้ที่เก็บข้อมูล ใช้ค่าเริ่มต้น
  }
  return 'lower';
}

// ด่านคณิต: หน้าเลือกระดับ/ด่าน + กระดานอันดับ → เข้าด่าน (AdventurePlay)
export function AdventureView({ profile, onExit }: { profile: Profile; onExit: () => void }) {
  const [level, setLevel] = useState<Level>(savedLevel);
  const [best, setBest] = useState<Best[] | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<{ level: Level; stage: number; key: number } | null>(null);
  const [board, setBoard] = useState<Subject | null>('math');
  const [ranks, setRanks] = useState<Rank[] | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (playing) return;
    let cancelled = false;
    fetchBest()
      .then((b) => !cancelled && setBest(b))
      .catch((e) => {
        console.error('โหลดด่านไม่ได้ (รัน supabase/migrations/007_math_adventure.sql แล้วหรือยัง?)', e);
        if (!cancelled) setError('โหลดด่านไม่ได้ ลองใหม่อีกครั้งนะ');
      });
    return () => {
      cancelled = true;
    };
  }, [playing, reload]);

  useEffect(() => {
    if (playing) return;
    let cancelled = false;
    leaderboard(board)
      .then((r) => !cancelled && setRanks(r))
      .catch(() => !cancelled && setRanks([]));
    return () => {
      cancelled = true;
    };
  }, [board, playing]);

  function pickLevel(l: Level) {
    setLevel(l);
    try {
      localStorage.setItem(LEVEL_KEY, l);
    } catch {
      // จำไม่ได้ก็ไม่เป็นไร
    }
  }

  if (playing) {
    return (
      <AdventurePlay
        key={playing.key}
        profile={profile}
        level={playing.level}
        stage={STAGES[playing.stage - 1]}
        onGo={(stage) => setPlaying({ level: playing.level, stage, key: playing.key + 1 })}
        onBack={() => setPlaying(null)}
      />
    );
  }

  const starsOf = (n: number) => best?.find((b) => b.level === level && b.stage === n)?.stars ?? 0;
  const unlocked = (n: number) => n === 1 || starsOf(n - 1) > 0;
  const myPoints = best ? pointsOf(best) : 0;
  const levelInfo = LEVELS.find((l) => l.id === level)!;
  const firstNew = STAGES.find((s) => unlocked(s.n) && !starsOf(s.n))?.n; // ด่านที่ควรเล่นต่อ

  return (
    <div className="screen adventure-hub">
      <div className="panel wide">
        <div className="hub-head">
          <h1>⚔️ ด่านคณิต</h1>
          <span className="stat">⭐ คะแนนคณิตของฉัน {myPoints}</span>
          <button onClick={onExit}>🏘️ กลับเมือง</button>
        </div>
        <ul className="hub-rules">
          <li>⚔️ เดินชนมอน → ตอบถูก = ตีมอน</li>
          <li>❤️ ตอบผิดหรือหมดเวลา = เสียหัวใจ (มี 3 ดวง)</li>
          <li>⭐ ล้มมอนครบ = ผ่านด่าน หัวใจเหลือมาก = ดาวเยอะ</li>
        </ul>
        {best === null && !error && <p className="muted">กำลังโหลดด่าน...</p>}
        {error && (
          <p className="error">
            {error}{' '}
            <button onClick={() => {
              setError('');
              setReload((n) => n + 1);
            }}>
              ลองใหม่
            </button>
          </p>
        )}

        <div className="level-tabs" role="tablist">
          {LEVELS.map((l) => (
            <button key={l.id} role="tab" aria-selected={l.id === level} className={l.id === level ? 'active' : ''} onClick={() => pickLevel(l.id)}>
              <span className="adv-long">{l.name}</span>
              <span className="adv-short">{l.short}</span>
              <small>ได้คะแนน ×{l.weight}</small>
            </button>
          ))}
        </div>

        <div className="stage-grid">
          {STAGES.map((s) => {
            const stars = starsOf(s.n);
            const open = best !== null && unlocked(s.n);
            const next = open && !stars && s.n === firstNew;
            return (
              <button
                key={s.n}
                className={`stage-card ${stars ? 'cleared' : ''} ${s.n === 10 ? 'boss' : ''} ${next ? 'next' : ''}`}
                disabled={!open}
                onClick={() => setPlaying({ level, stage: s.n, key: Date.now() })}
                title={open ? `${levelInfo.name} ด่าน ${s.n}` : `ผ่านด่าน ${s.n - 1} ก่อน`}
              >
                <span className="emoji">{open ? s.emoji : '🔒'}</span>
                <strong>ด่าน {s.n}</strong>
                <small>{s.name}</small>
                <span className="stars" aria-label={`${stars} ดาว`}>
                  {[1, 2, 3].map((i) => (i <= stars ? '★' : '☆')).join('')}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ranks">
          <div className="level-tabs small">
            <button className={board === 'math' ? 'active' : ''} onClick={() => {
              setBoard('math');
              setRanks(null);
            }}>
              🏆 อันดับคณิต
            </button>
            <button className={board === null ? 'active' : ''} onClick={() => {
              setBoard(null);
              setRanks(null);
            }}>
              🌟 อันดับรวมทุกวิชา
            </button>
          </div>
          {ranks === null && <p className="muted">กำลังโหลด...</p>}
          {ranks?.length === 0 && <p className="muted">ยังไม่มีใครผ่านด่าน เป็นคนแรกเลย!</p>}
          <ol>
            {ranks?.map((r, i) => (
              <li key={r.username} className={r.username === profile.username ? 'me' : ''}>
                <span className="rank-no">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                <Faceset character={r.character_name && CHARACTERS.includes(r.character_name) ? r.character_name : 'Boy'} size={24} />
                <span className="rank-name">{r.username}</span>
                <small>{r.stages} ด่าน</small>
                <b>{r.points}</b>
              </li>
            ))}
          </ol>
          <p className="muted small">คะแนน = ดาว x ระดับ (ม.ต้น x1, ม.ปลาย x2, มหาลัย x3) • วิชาอังกฤษกำลังมา</p>
        </div>
      </div>
    </div>
  );
}
