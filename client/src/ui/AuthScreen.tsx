import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'Email not confirmed': 'ยังไม่ได้ยืนยันอีเมล ลองเช็กกล่องจดหมาย (และ Junk)',
  'User already registered': 'อีเมลนี้สมัครไว้แล้ว ลองกดเข้าสู่ระบบแทน',
};

// หน้าเข้าสู่ระบบ / สมัครสมาชิก ด้วยอีเมลและรหัสผ่าน
export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMessage({ text: ERRORS[error.message] ?? error.message, error: true });
    } else if (mode === 'signup' && !data.session) {
      setMessage({ text: 'สมัครแล้ว! เปิดอีเมลแล้วกดลิงก์ยืนยัน จากนั้นกลับมาเข้าสู่ระบบ', error: false });
    }
  }

  return (
    <div className="screen">
      <form className="panel" onSubmit={submit}>
        <h1>Pixel Study Town</h1>
        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            เข้าสู่ระบบ
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            สมัครสมาชิก
          </button>
        </div>
        <label>
          อีเมล
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          รหัสผ่าน (อย่างน้อย 6 ตัว)
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'รอสักครู่...' : mode === 'login' ? 'เข้าเมือง' : 'สมัคร'}
        </button>
        {message && <p className={message.error ? 'error' : 'success'}>{message.text}</p>}
      </form>
    </div>
  );
}
