import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import { fetchProfile, type Profile } from './lib/profile';
import { useFocus } from './lib/focus';
import { MusicPlayer } from './ui/MusicPlayer';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { AuthScreen } from './ui/AuthScreen';
import { ProfileEditor } from './ui/ProfileEditor';
import { CommunityPicker } from './ui/CommunityPicker';
import { WorldView, type WorldTarget } from './ui/WorldView';
import { AdventureView } from './ui/AdventureView';
import { SurvivorView } from './ui/SurvivorView';
import { rankOf } from './lib/wallet';

// ลำดับหน้าจอ: ล็อกอิน → สร้างตัวละคร (ครั้งแรก) → เลือกคอมมู → เข้าเมือง ⇄ บ้าน
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const userId = session?.user.id;
  // จำไว้ด้วยว่าโปรไฟล์ที่โหลดมาเป็นของบัญชีไหน กันข้อมูลบัญชีเก่าค้างตอนสลับบัญชี
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null; error?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  // ตอนนี้อยู่ที่ไหน (null = หน้าเลือกคอมมู) และคอมมูล่าสุด (ไว้กลับจากบ้าน)
  const [target, setTarget] = useState<WorldTarget | null>(null);
  const [lastCommunity, setLastCommunity] = useState<string | null>(null);
  // ออกจากเมืองชั่วคราว: math = ด่านคณิต, arena = สนามรบ
  const [adventure, setAdventure] = useState<'math' | 'arena' | null>(null);

  const goTown = useCallback((communityId: string) => {
    setLastCommunity(communityId);
    setTarget({ kind: 'town', communityId });
  }, []);
  const visitHome = useCallback((ownerId: string) => setTarget({ kind: 'home', ownerId }), []);
  const visitPlace = useCallback(
    (placeId: string) => lastCommunity && setTarget({ kind: 'place', placeId, communityId: lastCommunity }),
    [lastCommunity],
  );
  // ออกจากบ้าน/ตึก → กลับเมือง และบอกว่าออกมาจากไหน จะได้เกิดหน้าประตูนั้น
  const openAdventure = useCallback((gate: string) => setAdventure(gate === 'arena' ? 'arena' : 'math'), []);
  // ออกจากด่าน/สนามรบ → กลับมายืนหน้าประตูนั้นในลานเมือง
  const leaveAdventure = useCallback(() => {
    setTarget(lastCommunity ? { kind: 'town', communityId: lastCommunity, from: adventure ?? undefined } : null);
    setAdventure(null);
  }, [lastCommunity, adventure]);
  const leaveHome = useCallback(
    () =>
      setTarget((t) => {
        if (!lastCommunity) return null;
        // ออกจากบ้านเพื่อน (เข้าทางการ์ดเพื่อน ไม่ได้เดินเข้าประตู) = เกิดกลางลานตามปกติ
        const from = t?.kind === 'place' ? t.placeId : t?.kind === 'home' && t.ownerId === userId ? 'home' : undefined;
        return { kind: 'town', communityId: lastCommunity, from };
      }),
    [lastCommunity, userId],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const focus = useFocus(userId); // อยู่ระดับแอป นาฬิกาจะไม่หยุดตอนเดินเปลี่ยนห้อง
  const [homeMusic, setHomeMusic] = useState<{ key: string; ownerName: string } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile(userId)
      .then((profile) => !cancelled && setLoaded({ userId, profile }))
      .catch((err) => {
        const error = `โหลดโปรไฟล์ไม่ได้: ${err.message ?? err} (รัน SQL ใน Supabase แล้วหรือยัง?)`;
        if (!cancelled) setLoaded({ userId, profile: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ได้รางวัล (โฟกัส งานเสร็จ ด่าน สนามรบ) → โหลด XP/เหรียญใหม่ แล้วบอกว่าได้เท่าไร
  const [reward, setReward] = useState('');
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      // รอฐานข้อมูลบันทึกเสร็จสักครู่ (หลายอย่างเกิดพร้อมกันก็โหลดครั้งเดียว)
      timer = setTimeout(() => {
        fetchProfile(userId)
          .then((p) => {
            if (!p) return;
            setLoaded((prev) => {
              const old = prev?.userId === userId ? prev.profile : null;
              if (old) {
                const coins = p.coins - old.coins;
                const xp = p.xp - old.xp;
                const parts = [coins > 0 && `+${coins} 🪙`, xp > 0 && `+${xp} XP`].filter(Boolean);
                const up = rankOf(p.xp).name !== rankOf(old.xp).name ? ` • แรงค์ใหม่ ${rankOf(p.xp).emoji} ${rankOf(p.xp).name}!` : '';
                if (parts.length) setReward(parts.join(' ') + up);
              }
              return { userId, profile: p };
            });
          })
          .catch(() => {}); // โหลดไม่ได้ก็ใช้ค่าเดิมไปก่อน
      }, 600);
    };
    window.addEventListener('pst-wallet', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pst-wallet', refresh);
    };
  }, [userId]);
  useEffect(() => {
    if (!reward) return;
    const id = setTimeout(() => setReward(''), 4000);
    return () => clearTimeout(id);
  }, [reward]);

  const current = loaded && loaded.userId === userId ? loaded : undefined;
  const profile = current?.profile;
  const error = current?.error;

  if (!supabaseConfigured) {
    return (
      <Message text="ยังไม่ได้ตั้งค่า Supabase: สร้างไฟล์ client/.env ตามตัวอย่างใน .env.example แล้วรีสตาร์ทเซิร์ฟเวอร์" />
    );
  }
  if (error) return <Message text={error} />;
  if (session === undefined) return <Message text="กำลังโหลด..." />;
  if (!session) return <AuthScreen />;
  if (profile === undefined) return <Message text="กำลังโหลดโปรไฟล์..." />;

  // เครื่องเล่นเพลงอยู่นอกทุกหน้าจอ เพลงจึงเล่นต่อได้ตอนแต่งตัว เปลี่ยนคอมมู หรือเดินระหว่างเมืองกับบ้าน
  let screen;
  if (!profile || editing) {
    screen = (
      <ProfileEditor
        userId={session.user.id}
        profile={profile}
        onSaved={(p) => {
          setLoaded({ userId: session.user.id, profile: p });
          setEditing(false);
        }}
        onCancel={profile ? () => setEditing(false) : undefined}
      />
    );
  } else if (adventure) {
    screen = (
      <ErrorBoundary label={adventure === 'arena' ? 'สนามรบ' : 'ด่านคณิต'} onReset={leaveAdventure}>
        {adventure === 'arena' ? (
          <SurvivorView profile={profile} onExit={leaveAdventure} />
        ) : (
          <AdventureView profile={profile} onExit={leaveAdventure} />
        )}
      </ErrorBoundary>
    );
  } else if (!target) {
    screen = (
      <CommunityPicker
        onPick={goTown}
        onEditProfile={() => setEditing(true)}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  } else {
    screen = (
      <ErrorBoundary label="ห้องนี้" onReset={() => setTarget(null)}>
      <WorldView
        key={target.kind === 'home' ? `home-${target.ownerId}` : `${target.kind}-${target.kind === 'place' ? target.placeId : ''}-${target.communityId}`}
        profile={profile}
        target={target}
        onPickCommunity={() => setTarget(null)}
        onEditProfile={() => setEditing(true)}
        onVisitHome={visitHome}
        onLeaveHome={leaveHome}
        onVisitPlace={visitPlace}
        onAdventure={openAdventure}
        focus={focus}
        onHomeMusic={setHomeMusic}
      />
      </ErrorBoundary>
    );
  }

  return (
    <>
      {screen}
      {reward && (
        <div className="reward-toast" role="status">
          {reward}
        </div>
      )}
      {profile && (
        <ErrorBoundary label="เครื่องเล่นเพลง">
          <MusicPlayer homeMusic={homeMusic} />
        </ErrorBoundary>
      )}
    </>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div className="screen">
      <div className="panel">
        <p>{text}</p>
      </div>
    </div>
  );
}
