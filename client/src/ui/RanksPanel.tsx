import { useEffect, useState } from 'react';
import type { Profile } from '../lib/profile';
import { CHARACTERS } from '../lib/characters';
import { fetchWalletLog, rankOf, RANKS, xpLeaderboard, type WalletEntry, type XpRank } from '../lib/wallet';
import { Faceset } from './Faceset';

type Tab = 'week' | 'all' | 'me';
const SOURCE_EMOJI: Record<string, string> = { focus: '⏱️', todo: '📝', adv: '📐', arena: '⚔️', shop: '🛒' };

// แรงค์ของฉัน + กระดานอันดับ XP (สัปดาห์นี้ / ตลอดกาล) + ประวัติเหรียญ/XP ที่ได้
export function RanksPanel({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('week');
  const [ranks, setRanks] = useState<XpRank[] | null>(null);
  const [log, setLog] = useState<WalletEntry[] | null>(null);
  const [error, setError] = useState('');
  const rank = rankOf(profile.xp);

  useEffect(() => {
    let cancelled = false;
    const load = tab === 'me' ? fetchWalletLog().then((l) => !cancelled && setLog(l)) : xpLeaderboard(tab).then((r) => !cancelled && setRanks(r));
    load.catch((e) => {
      console.error('โหลดอันดับไม่ได้ (รัน supabase/migrations/008_economy.sql แล้วหรือยัง?)', e);
      if (!cancelled) setError('โหลดข้อมูลไม่ได้ ลองใหม่อีกครั้งนะ');
    });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  function pick(t: Tab) {
    setTab(t);
    setError('');
    if (t === 'me') setLog(null);
    else setRanks(null);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel ranks-panel" onClick={(e) => e.stopPropagation()}>
        <div className="hub-head">
          <h1>🏆 แรงค์</h1>
          <button onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>

        <div className="my-rank">
          <span className="rank-emoji">{rank.emoji}</span>
          <div>
            <strong>
              {rank.name} ({rank.th}) • ⭐ {profile.xp} XP • 🪙 {profile.coins}
            </strong>
            <div className="rank-bar">
              <i style={{ width: `${rank.progress * 100}%` }} />
            </div>
            <small className="muted">{rank.next ? `อีก ${rank.next.min - profile.xp} XP ถึง ${rank.next.emoji} ${rank.next.name}` : 'แรงค์สูงสุดแล้ว เก่งมาก!'}</small>
          </div>
        </div>
        <p className="muted small">
          ได้ XP จาก: โฟกัส 1 นาที = 1 XP • งานเสร็จ +5 • ดาวด่านคณิต • สนามรบ ({RANKS.map((r) => `${r.emoji}${r.min}`).join(' ')})
        </p>

        <div className="level-tabs small">
          <button className={tab === 'week' ? 'active' : ''} onClick={() => pick('week')}>
            สัปดาห์นี้
          </button>
          <button className={tab === 'all' ? 'active' : ''} onClick={() => pick('all')}>
            ตลอดกาล
          </button>
          <button className={tab === 'me' ? 'active' : ''} onClick={() => pick('me')}>
            ประวัติของฉัน
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {tab !== 'me' && (
          <div className="ranks">
            {!ranks && !error && <p className="muted">กำลังโหลด...</p>}
            {ranks?.length === 0 && <p className="muted">ยังไม่มีใครได้ XP เป็นคนแรกเลย!</p>}
            <ol>
              {ranks?.map((r, i) => (
                <li key={r.username} className={r.username === profile.username ? 'me' : ''}>
                  <span className="rank-no">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                  <Faceset character={r.character_name && CHARACTERS.includes(r.character_name) ? r.character_name : 'Boy'} size={24} />
                  <span className="rank-name">{r.username}</span>
                  {tab === 'all' && <small>{rankOf(r.xp).emoji}</small>}
                  <b>{r.xp}</b>
                </li>
              ))}
            </ol>
          </div>
        )}
        {tab === 'me' && (
          <div className="ranks wallet-log">
            {!log && !error && <p className="muted">กำลังโหลด...</p>}
            {log?.length === 0 && <p className="muted">ยังไม่มีประวัติ ลองโฟกัสหรือทำงานให้เสร็จดูนะ</p>}
            <ol>
              {log?.map((w) => (
                <li key={w.id}>
                  <span className="rank-no">{SOURCE_EMOJI[w.source] ?? '•'}</span>
                  <span className="rank-name">{w.note}</span>
                  {w.coins !== 0 && <small>🪙 {w.coins > 0 ? `+${w.coins}` : w.coins}</small>}
                  {w.xp > 0 && <b>+{w.xp}</b>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
