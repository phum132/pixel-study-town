import { useEffect, useState } from 'react';
import { COMMUNITIES } from '../lib/communities';
import { fetchOnlineCounts } from '../lib/colyseus';

type Props = { onPick: (communityId: string) => void; onEditProfile: () => void; onSignOut: () => void };

// หน้าเลือกคอมมู แสดงจำนวนคนออนไลน์ (อัปเดตทุก 10 วินาที)
export function CommunityPicker({ onPick, onEditProfile, onSignOut }: Props) {
  const [online, setOnline] = useState<Record<string, number> | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const load = () =>
      fetchOnlineCounts()
        .then((counts) => {
          setOnline(counts);
          setOffline(false);
        })
        .catch(() => setOffline(true));
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="screen">
      <div className="panel wide">
        <h1>เลือกคอมมู</h1>
        {offline && <p className="error">ติดต่อเซิร์ฟเวอร์เกมไม่ได้ (เปิด server แล้วหรือยัง?)</p>}
        <div className="community-grid">
          {COMMUNITIES.map((c) => (
            <button key={c.id} className="community-card" onClick={() => onPick(c.id)} disabled={offline}>
              <span className="emoji">{c.emoji}</span>
              <strong>{c.name}</strong>
              <small>{c.desc}</small>
              <span className="online">🟢 {online?.[c.id] ?? '-'} คนออนไลน์</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button onClick={onEditProfile}>แต่งตัว</button>
          <button onClick={onSignOut}>ออกจากระบบ</button>
        </div>
      </div>
    </div>
  );
}
