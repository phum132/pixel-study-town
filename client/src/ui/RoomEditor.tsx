import { useEffect, useState } from 'react';
import type Phaser from 'phaser';
import { FURNITURE, FURNITURE_BY_ID, type FurnitureKind } from '../lib/furniture';
import {
  canPlace,
  FLOOR_COLORS,
  FLOOR_STYLES,
  itemAt,
  WALL_COLORS,
  WALL_STYLES,
  type HomeData,
  type Theme,
} from '../lib/home';
import type { EditTool } from '../game/HomeScene';
import { FurnitureIcon } from './FurnitureIcon';

type Tab = FurnitureKind | 'theme';
const TABS: { id: Tab; label: string }[] = [
  { id: 'floor', label: '🪑 ของ' },
  { id: 'wall', label: '🖼️ ผนัง' },
  { id: 'rug', label: '🟥 พรม' },
  { id: 'theme', label: '🎨 ธีม' },
];

type Props = {
  saved: HomeData;
  bridge: Phaser.Events.EventEmitter;
  onSave: (home: HomeData) => Promise<void>;
  onClose: () => void;
};

// แผงแต่งห้อง (เฉพาะเจ้าของบ้าน): เลือกของ → คลิกในห้องเพื่อวาง, เลือกยางลบ → คลิกของเพื่อเอาออก
// การแก้ไขยังไม่บันทึกจนกว่าจะกด "บันทึก" คนที่มาส่องจะเห็นหลังบันทึกเท่านั้น
export function RoomEditor({ saved, bridge, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<HomeData>(saved);
  const [tab, setTab] = useState<Tab>('floor');
  const [tool, setTool] = useState<EditTool>('table_square');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // แจ้งเกมว่าใช้เครื่องมืออะไรอยู่ และคืนค่าเป็นโหมดเดินปกติเมื่อปิดแผง
  useEffect(() => {
    bridge.emit('edit-tool', tab === 'theme' ? null : tool);
  }, [bridge, tool, tab]);
  useEffect(() => () => void bridge.emit('edit-tool', null), [bridge]);

  // วาดห้องตามฉบับร่างทุกครั้งที่แก้
  useEffect(() => {
    bridge.emit('home-preview', draft);
  }, [bridge, draft]);

  // คลิกช่องในห้อง → วางหรือลบของ
  useEffect(() => {
    const onTile = ({ x, y }: { x: number; y: number }) => {
      setDraft((d) => {
        if (tool === 'erase') {
          const n = itemAt(d.layout, x, y);
          return n < 0 ? d : { ...d, layout: d.layout.filter((_, i) => i !== n) };
        }
        const item = tool ? FURNITURE_BY_ID.get(tool) : undefined;
        if (!item || !canPlace(d.layout, item, x, y)) return d;
        return { ...d, layout: [...d.layout, { i: item.id, x, y }] };
      });
    };
    bridge.on('tile-click', onTile);
    return () => void bridge.off('tile-click', onTile);
  }, [bridge, tool]);

  const setTheme = (patch: Partial<Theme>) => setDraft((d) => ({ ...d, theme: { ...d.theme, ...patch } }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave(draft);
    } catch (err) {
      setError(`บันทึกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <aside className="editor">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'theme' ? (
        <div className="editor-body">
          <ThemeRow label="พื้น" options={FLOOR_STYLES} value={draft.theme.floor} onPick={(floor) => setTheme({ floor })} />
          <ColorRow colors={FLOOR_COLORS} value={draft.theme.floorColor} onPick={(floorColor) => setTheme({ floorColor })} />
          <ThemeRow label="ผนัง" options={WALL_STYLES} value={draft.theme.wall} onPick={(wall) => setTheme({ wall })} />
          <ColorRow colors={WALL_COLORS} value={draft.theme.wallColor} onPick={(wallColor) => setTheme({ wallColor })} />
          <label className="check">
            <input
              type="checkbox"
              checked={draft.isPublic}
              onChange={(e) => setDraft((d) => ({ ...d, isPublic: e.target.checked }))}
            />
            ให้คนอื่นเข้ามาส่องบ้านได้
          </label>
        </div>
      ) : (
        <div className="editor-body">
          <p className="editor-tip">เลือกของแล้วคลิกในห้องเพื่อวาง (กรอบเขียว = วางได้)</p>
          <div className="item-grid">
            <button className={`item ${tool === 'erase' ? 'selected' : ''}`} onClick={() => setTool('erase')} title="ลบของ">
              <span className="erase">🧽</span>
              <small>ลบ</small>
            </button>
            {FURNITURE.filter((f) => f.kind === tab).map((f) => (
              <button key={f.id} className={`item ${tool === f.id ? 'selected' : ''}`} onClick={() => setTool(f.id)} title={f.name}>
                <FurnitureIcon item={f} />
                <small>{f.name}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? 'กำลังบันทึก...' : '💾 บันทึก'}
        </button>
        <button onClick={onClose} disabled={busy}>
          ยกเลิก
        </button>
      </div>
    </aside>
  );
}

function ThemeRow<T extends string>({ label, options, value, onPick }: { label: string; options: { id: T; name: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="swatch-row">
      <span>{label}</span>
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? 'active' : ''} onClick={() => onPick(o.id)}>
          {o.name}
        </button>
      ))}
    </div>
  );
}

function ColorRow({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="swatch-row">
      <span />
      {colors.map((c) => (
        <button key={c} className={`swatch ${value === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />
      ))}
    </div>
  );
}
