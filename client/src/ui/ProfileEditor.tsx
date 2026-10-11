import { useState, type FormEvent } from 'react';
import { DEFAULT_COLORS, PALETTES, type CharacterColors } from '../game/character';
import { saveProfile, USERNAME_RULE, type Profile } from '../lib/profile';
import { CharacterPreview } from './CharacterPreview';

const LABELS: Record<keyof CharacterColors, string> = {
  hair: 'ผม',
  skin: 'ผิว',
  shirt: 'เสื้อ',
  pants: 'กางเกง',
};

type Props = {
  userId: string;
  profile: Profile | null; // null = ผู้เล่นใหม่
  onSaved: (profile: Profile) => void;
  onCancel?: () => void;
};

// หน้าตั้งชื่อและแต่งตัวละคร ใช้ทั้งตอนสมัครใหม่และตอนกดแก้ไขทีหลัง
export function ProfileEditor({ userId, profile, onSaved, onCancel }: Props) {
  const [username, setUsername] = useState(profile?.username ?? '');
  const [colors, setColors] = useState<CharacterColors>(profile?.avatar ?? DEFAULT_COLORS);
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
      await saveProfile(userId, name, colors, !profile);
      onSaved({ id: userId, xp: 0, coins: 0, ...profile, username: name, avatar: colors });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <form className="panel" onSubmit={submit}>
        <h1>{profile ? 'แก้ไขตัวละคร' : 'สร้างตัวละคร'}</h1>
        <div className="preview">
          <CharacterPreview colors={colors} />
        </div>
        <label>
          ชื่อในเกม
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} placeholder="เช่น ภูมิ_เรียนเก่ง" />
        </label>
        {(Object.keys(PALETTES) as (keyof CharacterColors)[]).map((part) => (
          <div key={part} className="swatch-row">
            <span>{LABELS[part]}</span>
            {PALETTES[part].map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${colors[part] === c ? 'selected' : ''}`}
                style={{ background: c }}
                aria-label={`${LABELS[part]} ${c}`}
                onClick={() => setColors({ ...colors, [part]: c })}
              />
            ))}
          </div>
        ))}
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
