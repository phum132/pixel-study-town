import { supabase } from './supabase';

// ด่านผจญภัยวิชาคณิต: 10 ด่าน x 3 ระดับ ฐานข้อมูลสุ่มโจทย์และตรวจคำตอบเอง (ดู supabase/migrations/007_math_adventure.sql)

export type Subject = 'math';
export type Level = 'lower' | 'upper' | 'uni';

export const LEVELS: { id: Level; name: string; short: string; weight: number }[] = [
  { id: 'lower', name: 'ม.ต้น', short: 'ม.ต้น', weight: 1 },
  { id: 'upper', name: 'ม.ปลาย', short: 'ม.ปลาย', weight: 2 },
  { id: 'uni', name: 'เตรียมสอบเข้ามหาลัย', short: 'มหาลัย', weight: 3 },
];

export { STAGES, BOSSES, foeOf, monsterUrl, monsterFaceUrl, type Stage, type Foe } from './adventureStages';

// ---------- คุยกับฐานข้อมูล ----------

export type Run = { run_id: string; hearts: number; monsters: number[]; seconds: number };
export type Question = {
  question_id: string;
  monster: number;
  prompt: string;
  choices: string[];
  seconds_left: number;
  seconds: number;
  hearts: number;
};
export type AskResult = Question | { status: 'lost'; hearts: 0 };
export type AnswerResult = {
  correct: boolean;
  late: boolean;
  answer: number;
  explain: string;
  hearts: number;
  monster: number;
  monster_hp: number;
  status: 'playing' | 'won' | 'lost';
  stars: number | null;
  best_stars: number | null;
};
export type Best = { level: Level; stage: number; stars: number };
export type Rank = { username: string; character_name: string | null; points: number; stages: number };

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const startStage = (level: Level, stage: number) =>
  rpc<Run>('adv_start', { p_subject: 'math', p_level: level, p_stage: stage });
export const askQuestion = (runId: string, monster: number) => rpc<AskResult>('adv_ask', { p_run: runId, p_monster: monster });
// choice = -1 คือหมดเวลา (ฐานข้อมูลนับเป็นผิด)
export const answerQuestion = (questionId: string, choice: number) =>
  rpc<AnswerResult>('adv_answer', { p_question: questionId, p_choice: choice });
export const quitStage = (runId: string) => rpc<null>('adv_quit', { p_run: runId });
export const leaderboard = (subject: Subject | null) => rpc<Rank[]>('adv_leaderboard', { p_subject: subject });

export async function fetchBest(): Promise<Best[]> {
  const { data, error } = await supabase.from('adv_best').select('level, stage, stars').eq('subject', 'math');
  if (error) throw error;
  return data as Best[];
}

export function pointsOf(best: Best[]) {
  return best.reduce((sum, b) => sum + b.stars * (LEVELS.find((l) => l.id === b.level)?.weight ?? 1), 0);
}
