import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { notifyWallet } from './wallet';

// ฐานข้อมูลเป็นคนจับเวลาจริง (ดู 003_todos_focus.sql) เบราว์เซอร์แค่นับถอยหลังให้ดู
// ถ้าแก้นาฬิกาในเครื่อง นาทีที่ได้ก็ยังคิดจากนาฬิกาของฐานข้อมูลอยู่ดี

export const FOCUS_OPTIONS = [25, 50, 15]; // ต้องตรงกับที่ start_focus รับ (006_review_fixes.sql)
export const BREAK_MINUTES = 5;

// มิลลิวินาที → "MM:SS"
export function mmss(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

type ServerFocus = { started_at: string; planned_minutes: number; now: string };
type FocusResult = { minutes: number; completed: boolean };

export type FocusState =
  | { phase: 'idle' }
  | { phase: 'focus'; endsAt: number; planned: number }
  | { phase: 'break'; endsAt: number };

// เวลาสิ้นสุดตามนาฬิกาในเครื่อง (ชดเชยกรณีนาฬิกาเครื่องไม่ตรงกับฐานข้อมูล)
function localEnd(s: ServerFocus) {
  const offset = Date.now() - Date.parse(s.now);
  return Date.parse(s.started_at) + s.planned_minutes * 60_000 + offset;
}

// สัญญาณเสียงสั้นๆ ตอนหมดเวลา
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
    osc.onended = () => ctx.close();
  } catch {
    // บางเบราว์เซอร์ไม่ให้เล่นเสียง ไม่เป็นไร
  }
}

// สถานะ Pomodoro ของเรา ใช้ทั้งแอป (อยู่ต่อแม้เดินเปลี่ยนห้อง และกลับมานับต่อหลังรีเฟรช)
export function useFocus(userId: string | undefined) {
  const [state, setState] = useState<FocusState>({ phase: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const [lastResult, setLastResult] = useState<FocusResult | null>(null);
  const [error, setError] = useState('');
  const finishing = useRef(false);

  // โหลดรอบที่ค้างไว้ (เช่น รีเฟรชหน้าเว็บระหว่างโฟกัส)
  useEffect(() => {
    if (!userId) return;
    supabase.rpc('current_focus').then(({ data }) => {
      const s = data as ServerFocus | null;
      if (s) setState({ phase: 'focus', endsAt: localEnd(s), planned: s.planned_minutes });
    });
  }, [userId]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    const { data, error: err } = await supabase.rpc('finish_focus');
    finishing.current = false;
    if (err) {
      setError(err.message);
      return;
    }
    const result = data as FocusResult | null;
    setLastResult(result);
    notifyWallet(); // จบรอบโฟกัส = ได้ XP (ครบรอบได้เหรียญด้วย)
    if (result?.completed) {
      beep();
      setState({ phase: 'break', endsAt: Date.now() + BREAK_MINUTES * 60_000 });
    } else {
      setState({ phase: 'idle' });
    }
  }, []);

  // นาฬิกาเดินทุกวินาที และจบรอบเองเมื่อหมดเวลา
  useEffect(() => {
    if (state.phase === 'idle') return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t < state.endsAt) return;
      if (state.phase === 'focus') finish();
      else {
        beep();
        setState({ phase: 'idle' });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state, finish]);

  const start = useCallback(async (planned: number) => {
    setError('');
    setLastResult(null);
    const { data, error: err } = await supabase.rpc('start_focus', { planned });
    if (err) {
      setError(err.message);
      return;
    }
    const s = data as ServerFocus;
    setNow(Date.now());
    setState({ phase: 'focus', endsAt: localEnd(s), planned: s.planned_minutes });
  }, []);

  const skipBreak = useCallback(() => setState({ phase: 'idle' }), []);

  const remainingMs = state.phase === 'idle' ? 0 : Math.max(0, state.endsAt - now);
  return { state, remainingMs, lastResult, error, start, stop: finish, skipBreak };
}

export type FocusApi = ReturnType<typeof useFocus>;
