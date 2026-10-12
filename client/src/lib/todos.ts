import { supabase } from './supabase';
import { notifyWallet } from './wallet';

export type Todo = { id: string; text: string; done: boolean; done_at: string | null; is_public: boolean };

const COLUMNS = 'id, text, done, done_at, is_public';

// งานของเรา (ทั้งหมด) หรือของคนอื่น (เฉพาะที่เปิดสาธารณะ เพราะกฎ RLS ซ่อนที่เหลือให้เอง)
export async function fetchTodos(ownerId: string): Promise<Todo[]> {
  const { data, error } = await supabase.from('todos').select(COLUMNS).eq('owner_id', ownerId).order('created_at');
  if (error) throw error;
  return data;
}

export async function addTodo(text: string, isPublic: boolean): Promise<Todo> {
  const { data, error } = await supabase.from('todos').insert({ text, is_public: isPublic }).select(COLUMNS).single();
  if (error) throw error;
  return data;
}

export async function updateTodo(id: string, patch: Partial<Pick<Todo, 'text' | 'done' | 'is_public'>>): Promise<Todo> {
  const { data, error } = await supabase.from('todos').update(patch).eq('id', id).select(COLUMNS).single();
  if (error) throw error;
  if (patch.done) notifyWallet(); // งานเสร็จ = ได้ XP + เหรียญ (วันละ 20 อัน)
  return data;
}

export async function deleteTodo(id: string) {
  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) throw error;
}
