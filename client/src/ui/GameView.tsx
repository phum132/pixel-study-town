import { useEffect, useState } from 'react';
import { getStateCallbacks, type Room } from 'colyseus.js';
import { supabase } from '../lib/supabase';
import { gameClient, type ChatMessage } from '../lib/colyseus';
import { COMMUNITIES } from '../lib/communities';
import type { Profile } from '../lib/profile';
import { PhaserGame } from '../game/PhaserGame';
import { CharacterPreview } from './CharacterPreview';
import { ChatBox } from './ChatBox';

type Props = { profile: Profile; communityId: string; onExit: () => void; onEditProfile: () => void };

const MAX_MESSAGES = 50;

const LEAVE_REASONS: Record<number, string> = {
  4000: 'คุณเปิดเกมในแท็บหรืออุปกรณ์อื่น เลยถูกย้ายไปที่นั่นแทน',
};

// เข้าห้องของคอมมูที่เลือก แล้วแสดงเกม + แถบด้านบน + แชท
export function GameView({ profile, communityId, onExit, onEditProfile }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const community = COMMUNITIES.find((c) => c.id === communityId);

  useEffect(() => {
    let joined: Room | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession(); // token ล่าสุด (ต่ออายุให้อัตโนมัติ)
        const r = await gameClient.joinOrCreate('town', { community: communityId, token: data.session?.access_token });
        if (cancelled) {
          r.leave();
          return;
        }
        joined = r;
        // ฟังแชททันทีหลังเข้าห้อง ไม่งั้นประวัติแชทที่เซิร์ฟเวอร์ส่งมาตอนเข้าจะหายไป
        r.onMessage('history', (history: ChatMessage[]) => setMessages(history));
        r.onMessage('chat', (msg: ChatMessage) => setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES)));
        r.onLeave((code) => {
          if (code >= 4000 || code === 1006) setError(LEAVE_REASONS[code] ?? 'หลุดการเชื่อมต่อกับเซิร์ฟเวอร์');
        });
        setRoom(r);
        setError('');
      } catch (err) {
        if (!cancelled) setError(`เข้าเมืองไม่ได้: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      joined?.leave();
      setRoom(null);
    };
  }, [communityId, attempt]);

  // นับคนออนไลน์ในห้องนี้
  useEffect(() => {
    if (!room) return;
    const $ = getStateCallbacks(room);
    const players = $(room.state).players;
    const update = () => setOnline(room.state.players.size);
    const offs = [players.onAdd(update), players.onRemove(update)];
    return () => offs.forEach((off) => off());
  }, [room]);

  if (error) {
    return (
      <div className="screen">
        <div className="panel">
          <p className="error">{error}</p>
          <button className="primary" onClick={() => setAttempt((n) => n + 1)}>
            ลองใหม่
          </button>
          <button onClick={onExit}>กลับไปเลือกคอมมู</button>
        </div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="screen">
        <div className="panel">
          <p>กำลังเดินเข้าเมือง {community?.emoji} {community?.name}...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="app">
      <PhaserGame colors={profile.avatar} name={profile.username} room={room} />
      <header className="topbar">
        <CharacterPreview colors={profile.avatar} scale={2} />
        <strong>{profile.username}</strong>
        <span className="stat">⭐ {profile.xp} XP</span>
        <span className="stat">🪙 {profile.coins}</span>
        <span className="stat">
          {community?.emoji} {community?.name} • 🟢 {online}
        </span>
        <button onClick={onExit}>เปลี่ยนคอมมู</button>
        <button onClick={onEditProfile}>แต่งตัว</button>
      </header>
      <ChatBox room={room} messages={messages} />
      <p className="hint">WASD / ลูกศร เดิน • Enter แชท • มือถือ: แตะค้างแล้วลาก</p>
    </main>
  );
}
