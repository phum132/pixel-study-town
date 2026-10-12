import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BASE_CHARACTERS, DEFAULT_CHARACTER } from '../lib/characters';
import { RARITY, SKINS, SKIN_BY_KEY, skinKey } from '../lib/skins';
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
  const gridRef = useRef<HTMLDivElement>(null);

  // เลื่อนตาราง (เฉพาะตาราง ไม่เลื่อนทั้งหน้า) ให้เห็นตัวที่เลือกอยู่ ทั้งตอนเปิดหน้าและตอนกดสุ่ม
  useEffect(() => {
    const grid = gridRef.current;
    const sel = grid?.querySelector<HTMLElement>('.selected');
    if (!grid || !sel) return;
    const off = sel.getBoundingClientRect().top - grid.getBoundingClientRect().top;
    if (off < 0 || off > grid.clientHeight - sel.offsetHeight) grid.scrollTop += off - grid.clientHeight / 2 + sel.offsetHeight / 2;
  }, [character]);

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

  const lockedSkin = SKIN_BY_KEY.get(character); // ยังไม่มีร้านค้า = สกินทุกตัวยังล็อก
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
        <div className="row">
          <span className="muted" style={{ flex: 1 }}>
            เลือกตัวละคร ({BASE_CHARACTERS.length} ตัว)
          </span>
          <button type="button" onClick={() => setCharacter(BASE_CHARACTERS[Math.floor(Math.random() * BASE_CHARACTERS.length)])}>
            🎲 สุ่ม
          </button>
        </div>
        <div className="character-grid" ref={gridRef}>
          {BASE_CHARACTERS.map((c) => (
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
        <span className="muted">✨ สกินอนิเมะ (กดเพื่อลองดู • แลกด้วยเหรียญในร้านค้า เร็วๆ นี้)</span>
        <div className="character-grid skins">
          {SKINS.map((s) => {
            const key = skinKey(s.id);
            return (
              <button
                key={key}
                type="button"
                className={`character-pick skin ${character === key ? 'selected' : ''}`}
                style={{ borderColor: RARITY[s.rarity].color }}
                onClick={() => setCharacter(key)}
                title={`${s.name} (${RARITY[s.rarity].name})`}
                aria-label={`${s.name} สกิน${RARITY[s.rarity].name}`}
              >
                <Faceset character={key} size={38} />
                <small>🔒 {s.name}</small>
              </button>
            );
          })}
        </div>
        {lockedSkin && (
          <p className="muted small">
            👀 กำลังลองสกิน {lockedSkin.name} ({RARITY[lockedSkin.rarity].name} {RARITY[lockedSkin.rarity].price} 🪙) — ยังใส่จริงไม่ได้ ต้องแลกในร้านค้าก่อน
          </p>
        )}
        <button className="primary" disabled={busy || !!lockedSkin}>
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
