import { useEffect, useMemo, useState } from 'react';
import Phaser from 'phaser';
import { getStateCallbacks, type Room } from 'colyseus.js';
import { supabase } from '../lib/supabase';
import { gameClient, type ChatMessage } from '../lib/colyseus';
import { COMMUNITIES } from '../lib/communities';
import { fetchHome, fetchUsername, saveHome, type HomeData } from '../lib/home';
import type { Profile } from '../lib/profile';
import { PhaserGame } from '../game/PhaserGame';
import { CharacterPreview } from './CharacterPreview';
import { ChatBox } from './ChatBox';
import { RoomEditor } from './RoomEditor';

export type WorldTarget = { kind: 'town'; communityId: string } | { kind: 'home'; ownerId: string };

type Props = {
  profile: Profile;
  target: WorldTarget;
  onPickCommunity: () => void;
  onEditProfile: () => void;
  onVisitHome: (ownerId: string) => void;
  onLeaveHome: () => void;
};

const MAX_MESSAGES = 50;
const LEAVE_REASONS: Record<number, string> = {
  4000: 'คุณเปิดเกมในแท็บหรืออุปกรณ์อื่น เลยถูกย้ายไปที่นั่นแทน',
};

// เข้าห้องบนเซิร์ฟเวอร์ (เมืองของคอมมู หรือบ้านของใครสักคน) แล้วแสดงเกม + แถบด้านบน + แชท
export function WorldView({ profile, target, onPickCommunity, onEditProfile, onVisitHome, onLeaveHome }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [home, setHome] = useState<HomeData | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [card, setCard] = useState<{ userId: string; name: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const bridge = useMemo(() => new Phaser.Events.EventEmitter(), []);

  const isHome = target.kind === 'home';
  const ownerId = target.kind === 'home' ? target.ownerId : '';
  const communityId = target.kind === 'town' ? target.communityId : '';
  const isOwner = isHome && ownerId === profile.id;
  const community = COMMUNITIES.find((c) => c.id === communityId);

  // เข้าห้อง (และโหลดข้อมูลบ้าน ถ้าเป็นบ้าน)
  useEffect(() => {
    let joined: Room | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession(); // token ล่าสุด (ต่ออายุให้อัตโนมัติ)
        const token = data.session?.access_token;
        const r = isHome
          ? await gameClient.joinOrCreate('home', { owner: ownerId, token })
          : await gameClient.joinOrCreate('town', { community: communityId, token });
        if (cancelled) {
          r.leave();
          return;
        }
        joined = r;
        // ฟังแชททันทีหลังเข้าห้อง ไม่งั้นประวัติแชทที่เซิร์ฟเวอร์ส่งมาตอนเข้าจะหายไป
        r.onMessage('history', (history: ChatMessage[]) => setMessages(history));
        r.onMessage('chat', (msg: ChatMessage) => setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES)));
        r.onMessage('reload', () => fetchHome(ownerId).then((h) => {
          setHome(h);
          bridge.emit('home-preview', h);
        }));
        r.onLeave((code) => {
          if (code >= 4000 || code === 1006) setError(LEAVE_REASONS[code] ?? 'หลุดการเชื่อมต่อกับเซิร์ฟเวอร์');
        });
        if (isHome) {
          const [h, name] = await Promise.all([fetchHome(ownerId), fetchUsername(ownerId)]);
          if (cancelled) return;
          setHome(h);
          setOwnerName(name);
        }
        setRoom(r);
        setError('');
      } catch (err) {
        if (!cancelled) setError(`เข้าไม่ได้: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      joined?.leave();
    };
  }, [isHome, ownerId, communityId, attempt, bridge]);

  // นับคนออนไลน์ในห้องนี้
  useEffect(() => {
    if (!room) return;
    const $ = getStateCallbacks(room);
    const players = $(room.state).players;
    const update = () => setOnline(room.state.players.size);
    const offs = [players.onAdd(update), players.onRemove(update)];
    return () => offs.forEach((off) => off());
  }, [room]);

  // เหตุการณ์จากในเกม
  useEffect(() => {
    const onEnterHome = () => onVisitHome(profile.id);
    const onCard = (c: { userId: string; name: string }) => setCard(c);
    bridge.on('enter-home', onEnterHome);
    bridge.on('exit-home', onLeaveHome);
    bridge.on('player-click', onCard);
    return () => {
      bridge.off('enter-home', onEnterHome);
      bridge.off('exit-home', onLeaveHome);
      bridge.off('player-click', onCard);
    };
  }, [bridge, onVisitHome, onLeaveHome, profile.id]);

  async function saveRoom(next: HomeData) {
    await saveHome(profile.id, next);
    setHome(next);
    setEditing(false);
    room?.send('room-updated'); // ให้คนที่อยู่ในบ้านเห็นของใหม่ทันที
  }

  function cancelEdit() {
    if (home) bridge.emit('home-preview', home); // กลับเป็นห้องที่บันทึกไว้
    setEditing(false);
  }

  if (error) {
    return (
      <div className="screen">
        <div className="panel">
          <p className="error">{error}</p>
          <button className="primary" onClick={() => {
            setError('');
            setAttempt((n) => n + 1);
          }}>
            ลองใหม่
          </button>
          <button onClick={isHome ? onLeaveHome : onPickCommunity}>{isHome ? 'กลับเมือง' : 'กลับไปเลือกคอมมู'}</button>
        </div>
      </div>
    );
  }
  if (!room || (isHome && !home)) {
    return (
      <div className="screen">
        <div className="panel">
          <p>{isHome ? 'กำลังเดินไปที่บ้าน...' : `กำลังเดินเข้าเมือง ${community?.emoji} ${community?.name}...`}</p>
        </div>
      </div>
    );
  }

  const place = isHome
    ? `🏠 ${isOwner ? 'บ้านของฉัน' : `บ้านของ ${ownerName}`}`
    : `${community?.emoji} ${community?.name}`;

  return (
    <main className="app">
      <PhaserGame
        key={room.sessionId}
        scene={isHome ? 'home' : 'town'}
        init={{ colors: profile.avatar, name: profile.username, room, bridge, home: home ?? undefined }}
      />
      <header className="topbar">
        <CharacterPreview colors={profile.avatar} scale={2} />
        <strong>{profile.username}</strong>
        <span className="stat">⭐ {profile.xp} XP</span>
        <span className="stat">🪙 {profile.coins}</span>
        <span className="stat">
          {place} • 🟢 {online}
        </span>
        {isHome ? (
          <>
            <button onClick={onLeaveHome}>🏘️ กลับเมือง</button>
            {isOwner && !editing && <button onClick={() => setEditing(true)}>🛠️ แต่งห้อง</button>}
          </>
        ) : (
          <>
            <button onClick={() => onVisitHome(profile.id)}>🏠 บ้านฉัน</button>
            <button onClick={onPickCommunity}>เปลี่ยนคอมมู</button>
          </>
        )}
        <button onClick={onEditProfile}>แต่งตัว</button>
      </header>

      {card && (
        <div className="player-card">
          <strong>{card.name}</strong>
          <button className="primary" onClick={() => {
            setCard(null);
            onVisitHome(card.userId);
          }}>
            🏠 ไปส่องบ้าน
          </button>
          <button onClick={() => setCard(null)}>ปิด</button>
        </div>
      )}

      {editing && home && <RoomEditor saved={home} bridge={bridge} onSave={saveRoom} onClose={cancelEdit} />}
      <ChatBox room={room} messages={messages} />
      <p className="hint">
        {isHome ? 'เดินลงไปที่ประตูด้านล่างเพื่อออกจากบ้าน' : 'เดินขึ้นไปชนประตูบ้านหลังไหนก็ได้ = เข้าบ้านตัวเอง • คลิกเพื่อนเพื่อไปส่องบ้าน'}
      </p>
    </main>
  );
}
