import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import { fetchProfile, type Profile } from './lib/profile';
import { AuthScreen } from './ui/AuthScreen';
import { ProfileEditor } from './ui/ProfileEditor';
import { CommunityPicker } from './ui/CommunityPicker';
import { GameView } from './ui/GameView';

// ลำดับหน้าจอ: ล็อกอิน → สร้างตัวละคร (ครั้งแรก) → เลือกคอมมู → เข้าเมือง
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // จำไว้ด้วยว่าโปรไฟล์ที่โหลดมาเป็นของบัญชีไหน กันข้อมูลบัญชีเก่าค้างตอนสลับบัญชี
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null; error?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [communityId, setCommunityId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
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

  if (!profile || editing) {
    return (
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
  }

  if (!communityId) {
    return (
      <CommunityPicker
        onPick={setCommunityId}
        onEditProfile={() => setEditing(true)}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  return (
    <GameView
      key={communityId}
      profile={profile}
      communityId={communityId}
      onExit={() => setCommunityId(null)}
      onEditProfile={() => setEditing(true)}
    />
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
