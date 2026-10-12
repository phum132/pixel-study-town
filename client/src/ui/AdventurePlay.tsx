import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { Profile } from '../lib/profile';
import {
  answerQuestion, askQuestion, foeOf, LEVELS, monsterFaceUrl, quitStage, startStage,
  type AnswerResult, type Level, type Question, type Run, type Stage,
} from '../lib/adventure';
import { PhaserGame } from '../game/PhaserGame';

type Battle =
  | { phase: 'loading'; touched: number }
  | { phase: 'question'; touched: number; q: Question; deadline: number; sending: boolean }
  | { phase: 'result'; touched: number; q: Question; picked: number; res: AnswerResult };
type End = { won: boolean; stars: number; best: number };

const errText = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e));

type Props = {
  profile: Profile;
  level: Level;
  stage: Stage;
  onGo: (stage: number) => void; // ไปด่านอื่น (ด่านต่อไป / เล่นซ้ำ)
  onBack: () => void;
};

// ในด่าน: เดินชนมอน → ฐานข้อมูลสุ่มโจทย์ → ตอบ → ฐานข้อมูลตรวจ แล้วบอกผล
export function AdventurePlay({ profile, level, stage, onGo, onBack }: Props) {
  const bridge = useMemo(() => new Phaser.Events.EventEmitter(), []);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState('');
  const [hearts, setHearts] = useState(3);
  const [hp, setHp] = useState<number[]>([]);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [end, setEnd] = useState<End | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const runRef = useRef<Run | null>(null);
  const sendingRef = useRef(false); // กันส่งคำตอบซ้ำ (กดรัว / หมดเวลาพร้อมกด)
  const timedOutRef = useRef(''); // ข้อที่ส่ง "หมดเวลา" ไปแล้ว (ส่งซ้ำทุก 0.25 วินาทีไม่ได้)
  const endedRef = useRef(false); // ด่านจบแล้ว ชนมอนต่อก็ไม่ต้องขอโจทย์
  const startRef = useRef<Promise<Run> | null>(null);
  const [battleError, setBattleError] = useState('');
  const levelName = LEVELS.find((l) => l.id === level)!.name;

  // เริ่มด่าน (ฐานข้อมูลตรวจว่าปลดล็อกแล้ว และบอกว่ามีมอนกี่ตัว เลือดเท่าไร)
  useEffect(() => {
    let cancelled = false;
    // StrictMode ตอนพัฒนาเรียก effect 2 รอบ: ใช้คำขอเดิม จะได้ไม่เริ่มด่านซ้อนกัน
    startRef.current ??= startStage(level, stage.n);
    startRef.current
      .then((r) => {
        if (cancelled) return;
        runRef.current = r;
        setRun(r);
        setHearts(r.hearts);
        setHp(r.monsters);
      })
      .catch((e) => !cancelled && setError(errText(e)));
    return () => {
      cancelled = true;
    };
  }, [level, stage.n]);

  const ask = useCallback(
    async (touched: number) => {
      const r = runRef.current;
      if (!r || endedRef.current) return;
      setBattleError('');
      setBattle({ phase: 'loading', touched });
      try {
        const res = await askQuestion(r.run_id, touched);
        if ('status' in res) {
          // ปล่อยโจทย์ข้อก่อนหน้าค้างจนหมดเวลา = เสียหัวใจดวงสุดท้าย
          setHearts(0);
          setBattle(null);
          endedRef.current = true;
          setEnd({ won: false, stars: 0, best: 0 });
          return;
        }
        setHearts(res.hearts);
        setNow(Date.now());
        setBattle({ phase: 'question', touched, q: res, deadline: Date.now() + res.seconds_left * 1000, sending: false });
      } catch (e) {
        setBattle(null);
        bridge.emit('battle-end', { index: touched });
        setError(errText(e));
      }
    },
    [bridge],
  );

  // ชนมอนในเกม
  useEffect(() => {
    bridge.on('battle', ask);
    return () => {
      bridge.off('battle', ask);
    };
  }, [bridge, ask]);

  const submit = useCallback(
    async (choice: number) => {
      if (!battle || battle.phase !== 'question' || sendingRef.current) return;
      if (choice < 0) {
        if (timedOutRef.current === battle.q.question_id) return;
        timedOutRef.current = battle.q.question_id;
      }
      sendingRef.current = true;
      setBattleError('');
      setBattle({ ...battle, sending: true });
      try {
        const res = await answerQuestion(battle.q.question_id, choice);
        setHearts(res.hearts);
        if (res.correct) {
          setHp((prev) => prev.map((h, i) => (i === res.monster ? res.monster_hp : h)));
          bridge.emit('monster-hp', { index: res.monster, hp: res.monster_hp });
        } else {
          bridge.emit('player-hit');
        }
        setBattle({ phase: 'result', touched: battle.touched, q: battle.q, picked: choice, res });
      } catch (e) {
        const msg = errText(e);
        if (/ตอบไปแล้ว|จบไปแล้ว|ไม่พบ/.test(msg)) {
          // ฐานข้อมูลปิดข้อนี้/รอบนี้ไปแล้ว (เช่น เน็ตหลุดตอนส่ง หรือเปิดด่านในแท็บอื่น) → ปิดหน้าต่างสู้ แล้วบอกเหตุผล
          setBattle(null);
          bridge.emit('battle-end', { index: battle.touched });
          setError(`${msg} • ถ้าเล่นต่อไม่ได้ ให้กดออกจากด่านแล้วเริ่มใหม่`);
        } else {
          setBattle({ ...battle, sending: false });
          setBattleError(`ส่งคำตอบไม่สำเร็จ (${msg}) ลองกดอีกครั้ง`);
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [battle, bridge],
  );

  // นาฬิกานับถอยหลัง (หมดเวลา = ส่ง -1 ให้ฐานข้อมูลนับเป็นผิด)
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  const deadline = battle?.phase === 'question' ? battle.deadline : 0;
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) submitRef.current(-1);
    }, 250);
    return () => clearInterval(id);
  }, [deadline]);
  const left = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;

  // หน้าต่างสู้บังวิดีโอเพลงบนจอเล็ก → ให้เครื่องเล่นเพลงหยุดไว้ก่อน (เหมือนตู้เกม Snake)
  const fighting = battle !== null;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pst-arcade', { detail: fighting }));
  }, [fighting]);
  useEffect(() => () => void window.dispatchEvent(new CustomEvent('pst-arcade', { detail: false })), []);

  // กดเลข 1-4 บนคีย์บอร์ด = เลือกคำตอบ
  useEffect(() => {
    if (battle?.phase !== 'question') return;
    const onKey = (e: KeyboardEvent) => {
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      const m = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].indexOf(e.code);
      const i = n >= 0 ? n : m;
      if (i >= 0) submit(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [battle?.phase, submit]);

  function closeBattle() {
    if (!battle) return;
    if (battle.phase === 'result' && battle.res.status !== 'playing') {
      const r = battle.res;
      endedRef.current = true;
      setEnd({ won: r.status === 'won', stars: r.stars ?? 0, best: r.best_stars ?? 0 });
    }
    bridge.emit('battle-end', { index: battle.touched });
    setBattle(null);
  }

  function leave() {
    const r = runRef.current;
    if (r && !end) quitStage(r.run_id).catch(() => {});
    onBack();
  }

  if (error && !run) {
    return (
      <div className="screen">
        <div className="panel">
          <p className="error">{error}</p>
          <button className="primary" onClick={onBack}>
            กลับเลือกด่าน
          </button>
        </div>
      </div>
    );
  }
  if (!run) {
    return (
      <div className="screen">
        <div className="panel">
          <p>กำลังเดินเข้า{stage.emoji} {stage.name}...</p>
        </div>
      </div>
    );
  }

  const total = run.monsters.length;
  const alive = hp.filter((h) => h > 0).length;
  const shown = battle && battle.phase !== 'loading' ? battle.q.monster : battle?.touched;
  const foe = shown !== undefined ? foeOf(stage, level, shown, total, run.monsters[shown]) : null;

  return (
    <main className="app adventure">
      <PhaserGame
        key={run.run_id}
        scene="adventure"
        init={{ character: profile.avatar.character, name: profile.username, bridge, stage, level, monsters: run.monsters }}
      />
      <header className="topbar">
        <strong>
          {stage.emoji} <span className="adv-long">{levelName} • </span>ด่าน {stage.n}<span className="adv-long"> {stage.name}</span>
        </strong>
        <span className="hearts" aria-label={`หัวใจ ${hearts} ดวง`}>
          {[0, 1, 2].map((i) => (i < hearts ? '❤️' : '🖤')).join('')}
        </span>
        <span className="stat">
          👾 เหลือ {alive}/{total}
        </span>
        <button onClick={leave}>
          🏳️ <span className="adv-long">ออกจากด่าน</span>
          <span className="adv-short">ออก</span>
        </button>
      </header>
      {error && (
        <div className="adv-error" role="alert" onClick={() => setError('')}>
          ⚠️ {error} (แตะเพื่อปิด)
        </div>
      )}
      <p className="hint">เดินไปชนมอนสเตอร์เพื่อสู้ • ตอบโจทย์ให้ถูกเพื่อโจมตี</p>

      {battle && foe && (
        <div className="modal-backdrop">
          <div className={`battle ${battle.phase === 'result' ? (battle.res.correct ? 'hit' : 'miss') : ''}`}>
            <header>
              <img src={monsterFaceUrl(foe.key)} alt="" className="pixel" width={48} height={48} />
              <div>
                <strong>{foe.name}</strong>
                <div className="mon-hp" aria-label="เลือดมอน">
                  {Array.from({ length: run.monsters[shown!] }, (_, i) => (
                    <i key={i} className={i < hp[shown!] ? 'on' : ''} />
                  ))}
                </div>
              </div>
              <span className="hearts">{[0, 1, 2].map((i) => (i < hearts ? '❤️' : '🖤')).join('')}</span>
              <button className="battle-quit" onClick={leave} title="ออกจากด่าน" aria-label="ออกจากด่าน">
                🏳️
              </button>
            </header>

            {battle.phase === 'loading' && <p className="question">กำลังเตรียมโจทย์... 🎲</p>}
            {battleError && (
              <p className="error" role="alert">
                ⚠️ {battleError}
              </p>
            )}

            {battle.phase !== 'loading' && (
              <>
                {battle.phase === 'question' && (
                  <div className="timer" aria-label={`เหลือ ${left} วินาที`}>
                    <i style={{ width: `${(100 * Math.max(0, battle.deadline - now)) / (battle.q.seconds * 1000)}%` }} className={left <= 10 ? 'low' : ''} />
                    <span>⏱️ {left}</span>
                  </div>
                )}
                <p className="question">{battle.q.prompt}</p>
                <div className="choices">
                  {battle.q.choices.map((c, i) => {
                    let cls = '';
                    if (battle.phase === 'result') {
                      if (i === battle.res.answer) cls = 'right';
                      else if (i === battle.picked) cls = 'wrong';
                    }
                    return (
                      <button
                        key={i}
                        className={cls}
                        disabled={battle.phase !== 'question' || battle.sending}
                        onClick={() => submit(i)}
                      >
                        <small>{i + 1}</small> {c}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {battle.phase === 'result' && (
              <div className="verdict">
                <p className={battle.res.correct ? 'success' : 'error'}>
                  {battle.res.correct
                    ? battle.res.monster_hp > 0
                      ? '⚔️ ถูกต้อง! โจมตีโดน'
                      : '💥 ถูกต้อง! ล้มมอนได้แล้ว'
                    : battle.res.late || battle.picked < 0
                      ? '⌛ หมดเวลา! โดนโจมตีกลับ'
                      : '💢 ยังไม่ถูก โดนโจมตีกลับ'}
                </p>
                {(battle.res.explain || !battle.res.correct) && (
                  <p className="explain">
                    {!battle.res.correct && <b>คำตอบที่ถูกคือ {battle.q.choices[battle.res.answer]} • </b>}
                    {battle.res.explain && <>💡 {battle.res.explain}</>}
                  </p>
                )}
                <div className="row">
                  {battle.res.status !== 'playing' ? (
                    <button className="primary" autoFocus onClick={closeBattle}>
                      {battle.res.status === 'won' ? '🏆 ดูผล' : 'ดูผล'}
                    </button>
                  ) : battle.res.monster_hp > 0 ? (
                    <>
                      <button className="primary" autoFocus onClick={() => ask(battle.touched)}>
                        ⚔️ ตีต่อ
                      </button>
                      <button onClick={closeBattle}>🏃 ถอยก่อน</button>
                    </>
                  ) : (
                    <button className="primary" autoFocus onClick={closeBattle}>
                      ไปต่อ ▶
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {end && (
        <div className="modal-backdrop">
          <div className="panel stage-end">
            {end.won ? (
              <>
                <h1>🎉 ผ่านด่าน {stage.n}!</h1>
                <p className="big-stars" aria-label={`${end.stars} ดาว`}>
                  {[1, 2, 3].map((i) => (i <= end.stars ? '★' : '☆')).join('')}
                </p>
                <p className="muted">
                  สถิติดีสุดของด่านนี้ {end.best} ดาว{stage.n === 10 ? ' • ล้มบอสได้แล้ว เก่งมาก!' : ''}
                </p>
              </>
            ) : (
              <>
                <h1>💀 หัวใจหมดแล้ว</h1>
                <p className="muted">ไม่เป็นไร ลองใหม่ได้เลย อ่านคำอธิบายในแต่ละข้อแล้วจะเก่งขึ้นเรื่อยๆ</p>
              </>
            )}
            <div className="row">
              {end.won && stage.n < 10 && (
                <button className="primary" onClick={() => onGo(stage.n + 1)}>
                  ด่านต่อไป ▶
                </button>
              )}
              <button className={end.won ? '' : 'primary'} onClick={() => onGo(stage.n)}>
                {end.won ? 'เล่นอีกครั้ง' : 'ลองใหม่'}
              </button>
              <button onClick={onBack}>กลับเลือกด่าน</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
