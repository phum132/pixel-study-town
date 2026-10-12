import { useState } from 'react';
import { FOCUS_OPTIONS, mmss, type FocusApi } from '../lib/focus';

// นาฬิกา Pomodoro มุมขวาบน: เลือกเวลา → เริ่มโฟกัส → ครบแล้วพัก 5 นาที
export function PomodoroTimer({ focus }: { focus: FocusApi }) {
  const { state, remainingMs, lastResult, error, start, stop, skipBreak } = focus;
  const [planned, setPlanned] = useState(FOCUS_OPTIONS[0]);
  const [confirmStop, setConfirmStop] = useState(false);

  return (
    <section className={`pomodoro ${state.phase}`}>
      {state.phase === 'idle' && (
        <>
          <div className="pomo-title">⏱️ โฟกัส</div>
          <div className="pomo-options">
            {FOCUS_OPTIONS.map((m) => (
              <button key={m} className={planned === m ? 'active' : ''} onClick={() => setPlanned(m)}>
                {m} นาที
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => start(planned)}>
            เริ่มโฟกัส
          </button>
          {lastResult && (
            <small className={lastResult.completed ? 'success' : 'muted'}>
              {lastResult.completed ? `🎉 โฟกัสครบ +${lastResult.minutes} นาที` : `หยุดก่อนเวลา ได้ ${lastResult.minutes} นาที`}
            </small>
          )}
        </>
      )}

      {state.phase === 'focus' && (
        <>
          <div className="pomo-title">📖 กำลังโฟกัส ({state.planned} นาที)</div>
          <div className="pomo-time">{mmss(remainingMs)}</div>
          {confirmStop ? (
            <div className="row">
              <button onClick={() => {
                setConfirmStop(false);
                stop();
              }}>
                หยุดเลย
              </button>
              <button className="primary" onClick={() => setConfirmStop(false)}>
                โฟกัสต่อ
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmStop(true)}>หยุด</button>
          )}
        </>
      )}

      {state.phase === 'break' && (
        <>
          <div className="pomo-title">☕ พักสายตา</div>
          <div className="pomo-time">{mmss(remainingMs)}</div>
          <small className="success">🎉 โฟกัสครบ +{lastResult?.minutes ?? 0} นาที</small>
          <button onClick={skipBreak}>ข้ามการพัก</button>
        </>
      )}

      {error && <small className="error">{error}</small>}
    </section>
  );
}
