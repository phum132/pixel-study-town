import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Room } from 'colyseus.js';
import type { ChatMessage } from '../lib/colyseus';

// กล่องแชทมุมจอ: กด Enter เพื่อเริ่มพิมพ์, Enter อีกทีเพื่อส่ง, Esc เพื่อกลับไปเดิน
export function ChatBox({ room, messages }: { room: Room; messages: ChatMessage[] }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // เลื่อนลงล่างสุดทุกครั้งที่มีข้อความใหม่
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  // กด Enter ที่ไหนก็ได้ = เปิดช่องพิมพ์
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function send(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed) room.send('chat', trimmed);
    setText('');
    inputRef.current?.blur(); // ส่งแล้วกลับไปเดินต่อได้ทันที
  }

  return (
    <section className={`chat ${open ? '' : 'collapsed'}`}>
      <button className="chat-toggle" onClick={() => setOpen(!open)}>
        💬 แชท {open ? '▾' : '▴'}
      </button>
      {open && (
        <>
          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <p className="chat-system">ยังไม่มีข้อความ ทักทายเพื่อนๆ สิ!</p>}
            {messages.map((m) =>
              m.system ? (
                <p key={m.id} className="chat-system">
                  {m.text}
                </p>
              ) : (
                <p key={m.id} className={m.sessionId === room.sessionId ? 'mine' : ''}>
                  <strong>{m.name}:</strong> {m.text}
                </p>
              ),
            )}
          </div>
          <form onSubmit={send}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && inputRef.current?.blur()}
              maxLength={200}
              placeholder="กด Enter เพื่อพิมพ์..."
            />
          </form>
        </>
      )}
    </section>
  );
}
