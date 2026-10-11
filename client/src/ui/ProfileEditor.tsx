import { useState, type FormEvent } from 'react';
import { CHARACTERS, DEFAULT_CHARACTER } from '../lib/characters';
import { saveProfile, USERNAME_RULE, type Profile } from '../lib/profile';
import { CharacterPreview } from './CharacterPreview';
import { Faceset } from './Faceset';

type Props = {
  userId: string;
  profile: Profile | null; // null = ผู้เล่นใหม่
  onSaved: (profile: Profile) => void;
  onCancel?: () => void;
};

// หน้าตั้งชื่อและเลือกตัวละคร ใช้ทั้งตอนสมัครใหม่และตอนกด "แต่งตัว" ทีหลัง
export function ProfileEditor({ userId, profile, onSaved, onCancel }: Props) {
  const [username, setUsername] = useState(profile?.username ?? '');
  const [character, setCharacter] = useState(profile?.avatar.character ?? DEFAULT_CHARACTER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!USERNAME_RULE.test(name)) {
      setError('ชื่อต้องยาว 3-16 ตัว ใช้ได้แค่ภาษาไทย อังกฤษ ตัวเลข และ _');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const avatar = { character };
      await saveProfile(userId, name, avatar, !profile);
      onSaved({ id: userId, xp: 0, coins: 0, ...profile, username: name, avatar });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <form className="panel wide" onSubmit={submit}>
        <h1>{profile ? 'เปลี่ยนตัวละคร' : 'สร้างตัวละคร'}</h1>
        <div className="preview">
          <CharacterPreview character={character} />
        </div>
        <label>
          ชื่อในเกม
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} placeholder="เช่น ภูมิ_เรียนเก่ง" />
        </label>
        <span className="muted">เลือกตัวละคร ({CHARACTERS.length} ตัว)</span>
        <div className="character-grid">
          {CHARACTERS.map((c) => (
            <button
              key={c}
              type="button"
              className={`character-pick ${character === c ? 'selected' : ''}`}
              onClick={() => setCharacter(c)}
              title={c}
              aria-label={c}
            >
              <Faceset character={c} size={38} />
            </button>
          ))}
        </div>
        <button className="primary" disabled={busy}>
          {busy ? 'กำลังบันทึก...' : profile ? 'บันทึก' : 'เข้าเมือง!'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            ยกเลิก
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
