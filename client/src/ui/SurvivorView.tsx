import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Phaser from 'phaser';
import type { Profile } from '../lib/profile';
import { RUN_SECONDS } from '../lib/survivor';
import { ELEMENTS, SKILL_BY_ID, SKILLS, describeSkill, specialOf } from '../lib/skills';
import { mmss } from '../lib/focus';
import { PhaserGame } from '../game/PhaserGame';
import type { Hud, LevelUpChoice, RunResult } from '../game/SurvivorScene';
import { arenaFinish, arenaStart, notifyWallet } from '../lib/wallet';

type Award = { coins: number; xp: number; capped: boolean } | 'saving' | 'error' | 'offline';

type Props = { profile: Profile; onExit: () => void };

// สนามรบ: หน้าเริ่ม → เล่น (แถบเลือด/คริสตัล/เวลา + หน้าต่างเลือกพลังตอนเลเวลอัป) → สรุปผล
export function SurvivorView({ profile, onExit }: Props) {
  const [round, setRound] = useState(0); // 0 = หน้าเริ่ม / เปลี่ยนเลข = เริ่มรอบใหม่
  const [bridge, setBridge] = useState(() => new Phaser.Events.EventEmitter()); // ช่องคุยกับฉากเกม (รอบใหม่ = อันใหม่)
  const [hud, setHud] = useState<Hud | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; choices: LevelUpChoice[] } | null>(null);
  const [menu, setMenu] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [toast, setToast] = useState('');
  const [banner, setBanner] = useState<{ name: string; emoji: string; n: number } | null>(null);
  const [award, setAward] = useState<Award | null>(null);
  const runRef = useRef<Promise<string | null> | null>(null); // รหัสรอบจากฐานข้อมูล (null = เริ่มไม่ได้ เล่นได้แต่ไม่ได้รางวัล)

  useEffect(() => {
    const onHud = (h: Hud) => setHud(h);
    const onLevel = (l: { level: number; choices: LevelUpChoice[] }) => setLevelUp(l);
    const onEnd = (r: RunResult) => {
      setResult(r);
      setAward('saving');
      const run = runRef.current;
      runRef.current = null;
      (run ?? Promise.resolve(null))
        .then((id) => {
          if (!id) return setAward('offline');
          return arenaFinish(id, r).then((a) => {
            setAward(a);
            notifyWallet();
          });
        })
        .catch(() => setAward('error'));
    };
    const onToast = (t: string) => setToast(t);
    bridge.on('hud', onHud);
    bridge.on('levelup', onLevel);
    bridge.on('end', onEnd);
    bridge.on('toast', onToast);
    const onUlt = (u: { name: string; emoji: string }) => setBanner((b) => ({ ...u, n: (b?.n ?? 0) + 1 }));
    bridge.on('ult-cast', onUlt);
    return () => {
      bridge.off('hud', onHud);
      bridge.off('levelup', onLevel);
      bridge.off('end', onEnd);
      bridge.off('toast', onToast);
      bridge.off('ult-cast', onUlt);
    };
  }, [bridge]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 1600);
    return () => clearTimeout(id);
  }, [banner]);

  const pick = useCallback(
    (c: LevelUpChoice) => {
      setLevelUp(null);
      bridge.emit('pick', c);
    },
    [bridge],
  );

  const toggleMenu = useCallback(
    (on: boolean) => {
      setMenu(on);
      bridge.emit('pause', on);
    },
    [bridge],
  );

  // คีย์บอร์ด: 1-3 เลือกพลัง / Esc หยุดเกม
  useEffect(() => {
    if (!round || result) return;
    const onKey = (e: KeyboardEvent) => {
      if (levelUp) {
        const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
        if (i >= 0 && levelUp.choices[i]) pick(levelUp.choices[i]);
      } else if (e.code === 'Escape') {
        toggleMenu(!menu);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [round, result, levelUp, menu, pick, toggleMenu]);

  // หน้าต่างบังวิดีโอเพลงบนจอเล็ก → หยุดเพลงไว้ก่อน (กฎ YouTube) แล้วเล่นต่อเมื่อปิด
  const covering = !!levelUp || menu || !!result;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pst-arcade', { detail: covering }));
  }, [covering]);
  useEffect(() => () => void window.dispatchEvent(new CustomEvent('pst-arcade', { detail: false })), []);

  function start() {
    setHud(null);
    setLevelUp(null);
    setMenu(false);
    setResult(null);
    setToast('');
    setAward(null);
    runRef.current = arenaStart().catch(() => null);
    setBridge(new Phaser.Events.EventEmitter());
    setRound((r) => r + 1);
  }

  const special = specialOf(profile.avatar.character);
  const startSkill = SKILL_BY_ID.get(special.start);

  if (!round) {
    return (
      <div className="screen">
        <div className="panel arena-intro">
          <h1>⚔️ สนามรบ</h1>
          <ul className="hub-rules">
            <li>👾 มอนจะกรูเข้ามาเรื่อยๆ ตัวละครปาดาวกระจายใส่เอง</li>
            <li>💎 เก็บคริสตัลเพื่อเลเวลอัป แล้วเลือกพลังใหม่ 1 ใน 3</li>
            <li>⏱️ รอดให้ครบ {RUN_SECONDS / 60} นาที บอสจะออกมา ล้มบอส = ชนะ</li>
            <li>🪙 เหรียญที่เก็บได้เข้ากระเป๋าจริง (วันละไม่เกิน 150 เหรียญจากสนามรบ) + ได้ XP ตามเวลาที่รอด</li>
          </ul>
          <div className="my-special">
            <strong>พลังประจำตัวของคุณ</strong>
            <span>
              สกิลเริ่มต้น: {startSkill?.emoji} {startSkill?.name} <small className="muted">({startSkill && describeSkill(startSkill)})</small>
            </span>
            <span>
              ท่าไม้ตาย: {ELEMENTS[special.ult.element].emoji} <b>{special.ult.name}</b> <small className="muted">(ล้มมอนจนเกจเต็ม แล้วกด Space / ปุ่มบนจอ)</small>
            </span>
            <small className="muted">มีสกิลทั้งหมด {SKILLS.length} แบบ: ธาตุ 8 x รูปแบบ 8 และเอาสกิลเลเวล 3 ที่ธาตุหรือรูปแบบเดียวกันมาผสมได้</small>
          </div>
          <p className="muted small">คอม: WASD/ลูกศร เดิน • เมาส์เล็ง • Space ท่าไม้ตาย • Esc หยุด / มือถือ: แตะค้างแล้วลากเพื่อเดิน เล็งมอนใกล้สุดให้เอง</p>
          <div className="row">
            <button className="primary" onClick={start}>
              เริ่มเลย!
            </button>
            <button onClick={onExit}>🏘️ กลับเมือง</button>
          </div>
        </div>
      </div>
    );
  }

  const hpPct = hud ? (100 * hud.hp) / hud.maxHp : 100;
  const xpPct = hud ? (100 * hud.xp) / hud.need : 0;
  const left = hud ? Math.max(0, RUN_SECONDS - hud.sec) : RUN_SECONDS;

  return (
    <main className="app arena">
      <PhaserGame key={round} scene="survivor" init={{ character: profile.avatar.character, name: profile.username, bridge }} />

      <div className="arena-hud">
        <div className="bar hp" aria-label={`เลือด ${hud?.hp ?? 0}`}>
          <i style={{ width: `${hpPct}%` }} />
          <span>❤️ {hud?.hp ?? '-'} / {hud?.maxHp ?? '-'}</span>
        </div>
        <div className="bar xp" aria-label={`เลเวล ${hud?.level ?? 1}`}>
          <i style={{ width: `${xpPct}%` }} />
          <span>Lv {hud?.level ?? 1}</span>
        </div>
        <div className="arena-stats">
          <span>{hud?.boss !== undefined ? '👹 บอส!' : `⏱️ ${mmss(left * 1000)}`}</span>
          <span>💀 {hud?.kills ?? 0}</span>
          <span>🪙 {hud?.coins ?? 0}</span>
          <button onClick={() => toggleMenu(true)} aria-label="หยุดเกม">
            ⏸️
          </button>
        </div>
        {hud?.boss !== undefined && (
          <div className="bar boss">
            <i style={{ width: `${hud.boss * 100}%` }} />
            <span>👹 วิญญาณยักษ์</span>
          </div>
        )}
      </div>
      {toast && <div className="arena-toast">{toast}</div>}
      <div className="skill-bar">
        {hud?.skills.map((k) => (
          <span key={k.id} className={`skill-slot ${k.fused ? 'fused' : ''}`} title={k.name}>
            <i>{k.emoji}</i>
            <small>{k.level}</small>
          </span>
        ))}
      </div>
      <button
        className={`ult-button ${(hud?.ult ?? 0) >= 100 ? 'ready' : ''}`}
        onClick={() => bridge.emit('ult')}
        disabled={(hud?.ult ?? 0) < 100}
        aria-label={`ท่าไม้ตาย ${hud?.ultName ?? ''}`}
        style={{ '--fill': `${hud?.ult ?? 0}%` } as CSSProperties}
      >
        <span>{ELEMENTS[special.ult.element].emoji}</span>
        <small>{(hud?.ult ?? 0) >= 100 ? 'กดเลย!' : `${Math.floor(hud?.ult ?? 0)}%`}</small>
      </button>
      {banner && (
        <div key={banner.n} className="ult-banner">
          {banner.emoji} {banner.name}!
        </div>
      )}

      {levelUp && (
        <div className="modal-backdrop">
          <div className="panel levelup">
            <h1>⬆️ เลเวล {levelUp.level}!</h1>
            <p className="muted">เลือกพลัง 1 อย่าง</p>
            <div className="upgrade-list">
              {levelUp.choices.map((c, i) => (
                <button key={`${c.kind}-${i}`} className={`upgrade-card ${c.kind}`} onClick={() => pick(c)} autoFocus={i === 0}>
                  <span className="emoji">{c.emoji}</span>
                  <span>
                    <strong>
                      {c.kind === 'fuse' && '✨ ผสม: '}
                      {c.name} {c.kind !== 'heal' && <small>{c.kind === 'skill' && c.next === 1 ? 'สกิลใหม่' : `ขั้น ${c.next}`}</small>}
                    </strong>
                    <small>{c.desc}</small>
                  </span>
                  <kbd>{i + 1}</kbd>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {menu && !levelUp && !result && (
        <div className="modal-backdrop">
          <div className="panel">
            <h1>⏸️ หยุดเกม</h1>
            <button className="primary" onClick={() => toggleMenu(false)} autoFocus>
              เล่นต่อ
            </button>
            <button onClick={start}>เริ่มใหม่</button>
            <button onClick={onExit}>🏘️ ออกไปเมือง</button>
          </div>
        </div>
      )}

      {result && (
        <div className="modal-backdrop">
          <div className="panel stage-end">
            <h1>{result.won ? '🏆 ชนะแล้ว! ล้มบอสได้' : '💀 พ่ายแพ้'}</h1>
            <div className="arena-result">
              <span>⏱️ รอดได้ {mmss(result.sec * 1000)}</span>
              <span>💀 ล้มมอน {result.kills} ตัว</span>
              <span>⬆️ เลเวล {result.level}</span>
              <span>🪙 เก็บเหรียญ {result.coins}</span>
            </div>
            <p className="arena-award">
              {award === 'saving' && 'กำลังบันทึกรางวัล...'}
              {award === 'offline' && 'รอบนี้เชื่อมฐานข้อมูลไม่ได้ เลยไม่ได้รางวัล'}
              {award === 'error' && 'บันทึกรางวัลไม่สำเร็จ'}
              {award && typeof award === 'object' && (
                <>
                  ได้จริง 🪙 +{award.coins} • ⭐ +{award.xp} XP
                  {award.capped && <small className="muted"> (ครบโควตาสนามรบวันนี้แล้ว)</small>}
                </>
              )}
            </p>
            <div className="row">
              <button className="primary" onClick={start} autoFocus>
                เล่นอีกรอบ
              </button>
              <button onClick={onExit}>🏘️ กลับเมือง</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
