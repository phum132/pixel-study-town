import { useEffect, useState, type FormEvent } from 'react';
import { addTodo, deleteTodo, fetchTodos, updateTodo, type Todo } from '../lib/todos';

type Props = {
  ownerId: string;
  ownerName: string;
  editable: boolean; // false = ดูงานของคนอื่น (เห็นเฉพาะงานที่เขาเปิดให้ดู)
  onClose: () => void;
};

// รายการ To-do: เพิ่ม ติ๊กเสร็จ ลบ และเลือกว่าจะให้คนที่มาส่องบ้านเห็นไหม (👁️ / 🔒)
export function TodoPanel({ ownerId, ownerName, editable, onClose }: Props) {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [text, setText] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchTodos(ownerId)
      .then((t) => alive && setTodos(t))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [ownerId]);

  // ทำงานกับฐานข้อมูล แล้วแสดงข้อผิดพลาดถ้าไม่สำเร็จ
  async function run(action: () => Promise<void>) {
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const replace = (t: Todo) => setTodos((list) => list?.map((x) => (x.id === t.id ? t : x)) ?? null);

  function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    run(async () => {
      const t = await addTodo(trimmed, isPublic);
      setTodos((list) => [...(list ?? []), t]);
      setText('');
    });
  }

  const pending = todos?.filter((t) => !t.done) ?? [];
  const done = todos?.filter((t) => t.done) ?? [];

  return (
    <aside className="todo-panel">
      <header>
        <strong>📝 {editable ? 'งานของฉัน' : `งานของ ${ownerName}`}</strong>
        <button onClick={onClose} aria-label="ปิด">
          ✕
        </button>
      </header>

      {editable && (
        <form onSubmit={add} className="todo-add">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="เช่น ทำการบ้านคณิต บทที่ 3" />
          <button
            type="button"
            title={isPublic ? 'คนที่มาส่องบ้านเห็นงานนี้' : 'งานนี้เห็นแค่เรา'}
            onClick={() => setIsPublic(!isPublic)}
          >
            {isPublic ? '👁️' : '🔒'}
          </button>
          <button className="primary">เพิ่ม</button>
        </form>
      )}

      <div className="todo-list">
        {todos === null && !error && <p className="muted">กำลังโหลด...</p>}
        {todos?.length === 0 && <p className="muted">{editable ? 'ยังไม่มีงาน เพิ่มงานแรกเลย!' : 'ยังไม่มีงานที่เปิดให้ดู'}</p>}
        {[...pending, ...done].map((t) => (
          <div key={t.id} className={`todo ${t.done ? 'done' : ''}`}>
            <input
              type="checkbox"
              checked={t.done}
              disabled={!editable}
              onChange={() => run(async () => replace(await updateTodo(t.id, { done: !t.done })))}
            />
            <span>{t.text}</span>
            {editable && (
              <>
                <button
                  className="icon"
                  title={t.is_public ? 'คนที่มาส่องบ้านเห็นงานนี้ (กดเพื่อซ่อน)' : 'งานนี้เห็นแค่เรา (กดเพื่อแสดง)'}
                  onClick={() => run(async () => replace(await updateTodo(t.id, { is_public: !t.is_public })))}
                >
                  {t.is_public ? '👁️' : '🔒'}
                </button>
                <button
                  className="icon"
                  title="ลบ"
                  onClick={() => run(async () => {
                    await deleteTodo(t.id);
                    setTodos((list) => list?.filter((x) => x.id !== t.id) ?? null);
                  })}
                >
                  🗑️
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {todos && todos.length > 0 && (
        <small className="muted">
          เสร็จแล้ว {done.length}/{todos.length} งาน
        </small>
      )}
      {error && <p className="error">{error}</p>}
    </aside>
  );
}
