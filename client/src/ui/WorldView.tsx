import { useCallback, useEffect, useMemo, useState } from 'react';
import Phaser from 'phaser';
import { getStateCallbacks, type Room } from 'colyseus.js';
import { supabase } from '../lib/supabase';
import { gameClient, type ChatMessage } from '../lib/colyseus';
import { COMMUNITIES } from '../lib/communities';
import { fetchHome, fetchUsername, saveHome, type HomeData } from '../lib/home';
import type { Profile } from '../lib/profile';
import { PhaserGame } from '../game/PhaserGame';
import { Faceset } from './Faceset';
import { ChatBox } from './ChatBox';
import { RoomEditor } from './RoomEditor';
import { PLACE_BY_ID } from '../lib/places';
import { PomodoroTimer } from './PomodoroTimer';
import { RanksPanel } from './RanksPanel';
import { rankOf } from '../lib/wallet';

type MobileTab = 'none' | 'chat' | 'focus' | 'todo';
import { TodoPanel } from './TodoPanel';
import { SnakeArcade } from './SnakeArcade';
import { mmss, type FocusApi } from '../lib/focus';

export type WorldTarget =
  | { kind: 'town'; communityId: string; from?: string } // from = เพิ่งเดินออกมาจากตึก/บ้านไหน
  | { kind: 'home'; ownerId: string }
  | { kind: 'place'; placeId: string; communityId: string }; // ตึกสาธารณะ (ห้องสมุด คาเฟ่ ฯลฯ)

type Props = {
  profile: Profile;
  target: WorldTarget;
  onPickCommunity: () => void;
  onEditProfile: () => void;
  onVisitHome: (ownerId: string) => void;
  onLeaveHome: () => void; // ออกจากบ้านหรือตึก กลับเมือง
  onVisitPlace: (placeId: string) => void;
  onAdventure: (gate: string) => void; // เดินเข้าประตูด่านคณิต (math) / สนามรบ (arena)
  focus: FocusApi;
  onHomeMusic: (music: { key: string; ownerName: string } | null) => void;
};

const MAX_MESSAGES = 50;
// รหัสตอนเซิร์ฟเวอร์เชิญออก (ต้องตรงกับ KICK ใน server/src/rooms/WorldRoom.ts) — รหัสอื่น = เน็ตหลุด จะลองต่อกลับเอง
const LEAVE_REASONS: Record<number, string> = {
  4100: 'คุณเปิดเกมในแท็บหรืออุปกรณ์อื่น เลยถูกย้ายไปที่นั่นแทน',
  4101: 'เจ้าของบ้านปิดห้องแล้ว',
  4110: 'ส่งข้อมูลถี่เกินไป เลยถูกพักการเชื่อมต่อ ลองเข้าใหม่อีกครั้ง',
};

// เข้าห้องบนเซิร์ฟเวอร์ (เมืองของคอมมู หรือบ้านของใครสักคน) แล้วแสดงเกม + แถบด้านบน + แชท
export function WorldView({ profile, target, onPickCommunity, onEditProfile, onVisitHome, onLeaveHome, onVisitPlace, onAdventure, focus, onHomeMusic }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [home, setHome] = useState<HomeData | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [roomKey, setRoomKey] = useState(0); // เปลี่ยนเมื่อได้ห้องใหม่ (เข้าใหม่/ต่อกลับ) ให้สร้างฉากเกมใหม่
  const [reconnecting, setReconnecting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [card, setCard] = useState<{ userId: string; name: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const [ranksOpen, setRanksOpen] = useState(false);
  const closeArcade = useCallback(() => setArcadeOpen(false), []);
  // มือถือ: แผงล่างเปิดได้ทีละแผงผ่านแถบแท็บ (บนคอมทุกแผงแสดงตามปกติ)
  const [tab, setTab] = useState<MobileTab>('none');
  const [seenId, setSeenId] = useState<string | undefined>();
  const lastId = messages.at(-1)?.id;
  const unread = tab !== 'chat' && !!lastId && lastId !== seenId;
  const pickTab = (t: MobileTab) => {
    if (tab === 'chat') setSeenId(lastId); // ออกจากแท็บแชท = อ่านแล้ว
    const next = tab === t ? 'none' : t; // กดแท็บเดิมซ้ำ = ปิด
    setTab(next);
    setShowTodos(next === 'todo');
  };
  const focusing = focus.state.phase === 'focus';
  const bridge = useMemo(() => new Phaser.Events.EventEmitter(), []);

  const isHome = target.kind === 'home';
  const ownerId = target.kind === 'home' ? target.ownerId : '';
  const isPlace = target.kind === 'place';
  const placeId = target.kind === 'place' ? target.placeId : '';
  const indoor = isHome || isPlace; // อยู่ในห้อง (ใช้ฉากห้องเดียวกัน)
  const communityId = target.kind === 'home' ? '' : target.communityId;
  const placeInfo = PLACE_BY_ID.get(placeId);
  const townFrom = target.kind === 'town' ? target.from : undefined;
  const isOwner = isHome && ownerId === profile.id;
  const community = COMMUNITIES.find((c) => c.id === communityId);

  // เข้าห้อง (และโหลดข้อมูลบ้าน ถ้าเป็นบ้าน)
  useEffect(() => {
    let joined: Room | undefined;
    let cancelled = false;

    // ลงทะเบียนตัวฟังข้อความของห้อง (ใช้ทั้งตอนเข้าครั้งแรกและตอนต่อกลับ)
    // ต้องฟังทันทีหลังเข้าห้อง ไม่งั้นประวัติแชทที่เซิร์ฟเวอร์ส่งมาตอนเข้าจะหายไป
    const attach = (r: Room) => {
      joined = r;
      r.onMessage('history', (history: ChatMessage[]) => {
        setMessages(history);
        setSeenId(history.at(-1)?.id); // ข้อความเก่าไม่นับว่ายังไม่อ่าน
      });
      r.onMessage('chat', (msg: ChatMessage) => setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES)));
      r.onMessage('reload', () =>
        fetchHome(ownerId)
          .then((h) => {
            setHome(h);
            bridge.emit('home-preview', h);
          })
          .catch(() => {}), // โหลดไม่ได้ก็ใช้ห้องเดิมไปก่อน
      );
      r.onLeave(async (code) => {
        if (cancelled) return; // เราออกเอง (เปลี่ยนหน้า)
        if (LEAVE_REASONS[code]) {
          setError(LEAVE_REASONS[code]); // ถูกเชิญออก ไม่ต่อกลับ
          return;
        }
        // เน็ตหลุดเอง (เช่น สลับแอปในมือถือ) → ลองต่อกลับห้องเดิม เซิร์ฟเวอร์รอให้ 20 วินาที
        setReconnecting(true);
        for (let i = 0; i < 6 && !cancelled; i++) {
          try {
            const back = await gameClient.reconnect(r.reconnectionToken);
            if (cancelled) {
              back.leave();
              return;
            }
            attach(back);
            // ฉากเกมจะถูกสร้างใหม่ (เริ่มแบบไม่ล็อกปุ่ม ไม่อยู่โหมดแต่งห้อง) จึงปิดตู้เกมและแผงแต่งห้องให้ตรงกัน
            setArcadeOpen(false);
            setEditing(false);
            setRoom(back);
            setRoomKey((k) => k + 1); // สร้างฉากเกมใหม่ให้ผูกกับห้องที่ต่อกลับ
            setReconnecting(false);
            return;
          } catch {
            await new Promise((ok) => setTimeout(ok, 3000));
          }
        }
        setReconnecting(false);
        if (!cancelled) setError('หลุดการเชื่อมต่อกับเซิร์ฟเวอร์');
      });
    };

    (async () => {
      try {
        const { data } = await supabase.auth.getSession(); // token ล่าสุด (ต่ออายุให้อัตโนมัติ)
        const token = data.session?.access_token;
        const r = isHome
          ? await gameClient.joinOrCreate('home', { owner: ownerId, token })
          : isPlace
            ? await gameClient.joinOrCreate('place', { place: placeId, community: communityId, token })
            : await gameClient.joinOrCreate('town', { community: communityId, token, from: townFrom });
        if (cancelled) {
          r.leave();
          return;
        }
        attach(r);
        if (isPlace) setHome(PLACE_BY_ID.get(placeId)?.room ?? null); // ตึกสาธารณะแต่งไว้แล้วในโค้ด
        if (isHome) {
          const [h, name] = await Promise.all([fetchHome(ownerId), fetchUsername(ownerId)]);
          if (cancelled) return;
          setHome(h);
          setOwnerName(name);
        }
        setRoom(r);
        setRoomKey((k) => k + 1);
        setError('');
        setArcadeOpen(false); // ฉากเกมถูกสร้างใหม่ = เริ่มแบบไม่ล็อกปุ่ม จึงต้องปิดตู้เกมด้วยให้ตรงกัน
      } catch (err) {
        if (!cancelled) setError(`เข้าไม่ได้: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      joined?.leave();
    };
  }, [isHome, isPlace, placeId, ownerId, communityId, townFrom, attempt, bridge]);

  // เพลงประจำบ้าน → ให้เครื่องเล่นเพลงขึ้นปุ่มชวนฟัง (เฉพาะบ้านคนอื่น) และล้างค่าเมื่อออกจากบ้าน
  const homeMusicKey = isHome && !isOwner ? home?.theme.music : undefined;
  useEffect(() => {
    onHomeMusic(homeMusicKey ? { key: homeMusicKey, ownerName } : null);
    return () => onHomeMusic(null);
  }, [homeMusicKey, ownerName, onHomeMusic]);

  // บอกเซิร์ฟเวอร์ว่ากำลังโฟกัสอยู่ไหม (ส่งใหม่ทุกครั้งที่เข้าห้องใหม่หรือสถานะเปลี่ยน)
  useEffect(() => {
    room?.send('status', { focusing });
  }, [room, focusing]);

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
    const onEnterPlace = (id: string) => onVisitPlace(id);
    const onCard = (c: { userId: string; name: string }) => setCard(c);
    const openArcade = () => setArcadeOpen(true);
    const openGate = (gate: string) => onAdventure(gate);
    bridge.on('enter-home', onEnterHome);
    bridge.on('enter-place', onEnterPlace);
    bridge.on('exit-home', onLeaveHome);
    bridge.on('player-click', onCard);
    bridge.on('open-arcade', openArcade);
    bridge.on('open-gate', openGate);
    return () => {
      bridge.off('enter-home', onEnterHome);
      bridge.off('enter-place', onEnterPlace);
      bridge.off('exit-home', onLeaveHome);
      bridge.off('player-click', onCard);
      bridge.off('open-arcade', openArcade);
      bridge.off('open-gate', openGate);
    };
  }, [bridge, onVisitHome, onLeaveHome, onVisitPlace, onAdventure, profile.id]);

  // เปิดตู้เกมอยู่ = ตัวละครห้ามเดิน (ปุ่มลูกศรใช้บังคับงู)
  useEffect(() => {
    bridge.emit('input-lock', arcadeOpen);
    window.dispatchEvent(new CustomEvent('pst-arcade', { detail: arcadeOpen })); // ให้เครื่องเล่นเพลงรู้ (อยู่คนละส่วนของแอป)
  }, [bridge, arcadeOpen]);

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
          <button onClick={indoor ? onLeaveHome : onPickCommunity}>{indoor ? 'กลับเมือง' : 'กลับไปเลือกคอมมู'}</button>
        </div>
      </div>
    );
  }
  if (!room || (indoor && !home)) {
    return (
      <div className="screen">
        <div className="panel">
          <p>{isHome ? 'กำลังเดินไปที่บ้าน...' : isPlace ? `กำลังเดินเข้า${placeInfo?.name ?? ''}...` : `กำลังเดินเข้าเมือง ${community?.emoji} ${community?.name}...`}</p>
        </div>
      </div>
    );
  }

  const place = isPlace
    ? `${placeInfo?.emoji} ${placeInfo?.name}`
    : isHome
    ? `🏠 ${isOwner ? 'บ้านของฉัน' : `บ้านของ ${ownerName}`}`
    : `${community?.emoji} ${community?.name}`;

  return (
    <main className="app">
      <PhaserGame
        key={roomKey}
        scene={indoor ? 'home' : 'town'}
        init={{ character: profile.avatar.character, name: profile.username, room, bridge, home: home ?? undefined }}
      />
      <header className="topbar">
        <Faceset character={profile.avatar.character} size={38} />
        <strong>{profile.username}</strong>
        <button className="rank-chip" onClick={() => setRanksOpen(true)} title="ดูแรงค์และกระดานอันดับ">
          {rankOf(profile.xp).emoji} ⭐ {profile.xp} • 🪙 {profile.coins}
        </button>
        <span className="stat">
          {place} • 🟢 {online}
        </span>
        {indoor ? (
          <>
            <button onClick={onLeaveHome}>🏘️ กลับเมือง</button>
            {isOwner && !editing && (
              <button onClick={() => {
                setEditing(true);
                setTab('none');
                setShowTodos(false);
              }}>
                🛠️ แต่งห้อง
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => onVisitHome(profile.id)}>🏠 บ้านฉัน</button>
            <button onClick={onPickCommunity}>เปลี่ยนคอมมู</button>
          </>
        )}
        <button className="desk-only" onClick={() => setShowTodos(!showTodos)}>
          📝 {isHome && !isOwner ? `งานของ ${ownerName}` : 'งานของฉัน'}
        </button>
        <button onClick={onEditProfile}>แต่งตัว</button>
      </header>

      {reconnecting && <div className="reconnecting">📡 สัญญาณหลุด กำลังต่อกลับ...</div>}

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

      <div className={`slot ${tab === 'focus' ? 'show' : ''}`}>
        <PomodoroTimer focus={focus} />
      </div>
      {arcadeOpen && <SnakeArcade onClose={closeArcade} />}
      {ranksOpen && <RanksPanel profile={profile} onClose={() => setRanksOpen(false)} />}
      {showTodos && !editing && (
        <TodoPanel
          ownerId={isHome ? ownerId : profile.id}
          ownerName={isHome && !isOwner ? ownerName : profile.username}
          editable={!isHome || isOwner}
          onClose={() => {
            setShowTodos(false);
            setTab('none');
          }}
        />
      )}
      {editing && home && <RoomEditor saved={home} bridge={bridge} onSave={saveRoom} onClose={cancelEdit} />}
      <div className={`slot ${tab === 'chat' ? 'show' : ''}`}>
        <ChatBox room={room} messages={messages} />
      </div>

      {!editing && (
        <nav className="tabbar">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => pickTab('chat')}>
            💬<span>แชท</span>
            {unread && <i className="dot" />}
          </button>
          <button className={tab === 'focus' ? 'active' : ''} onClick={() => pickTab('focus')}>
            ⏱️<span>{focus.state.phase === 'idle' ? 'โฟกัส' : mmss(focus.remainingMs)}</span>
          </button>
          <button className={tab === 'todo' ? 'active' : ''} onClick={() => pickTab('todo')}>
            📝<span>งาน</span>
          </button>
        </nav>
      )}
      <p className="hint">
        {isPlace ? `${placeInfo?.desc ?? ''} • เดินลงไปที่ประตูด้านล่างเพื่อออก` : isHome ? 'เดินลงไปที่ประตูด้านล่างเพื่อออกจากบ้าน' : 'เดินเข้าประตูที่มีป้าย = เข้าตึก • ประตูย่านบ้าน = บ้านตัวเอง • คลิกเพื่อน = ส่องบ้าน • ตู้เกม 🐍 ประตูด่านคณิต 📐 และสนามรบ ⚔️ อยู่ในลาน'}
      </p>
    </main>
  );
}
