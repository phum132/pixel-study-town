import { useEffect, useState } from 'react';
import type { Profile } from '../lib/profile';
import { saveProfile } from '../lib/profile';
import { RARITY, SKINS, skinKey } from '../lib/skins';
import { ELEMENTS, specialOf } from '../lib/skills';
import { buy, fetchInventory, ownsSkin, PERK_IDS, PERKS, skinPrice, type Inventory } from '../lib/shop';
import { notifyWallet } from '../lib/wallet';
import { Faceset } from './Faceset';
import { cardsOf, describePull, GACHA_PRICE, GACHA_RATES, pull, shardsOf, shardText, SHARD_IDS, SHARDS, type PullResult } from '../lib/gacha';

type Tab = 'skins' | 'perks' | 'gacha';
const errText = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e));

// ร้านค้า: แลกเหรียญเป็นสกินอนิเมะ (ได้ท่าไม้ตายของตัวนั้น) และอัปเกรดถาวรในสนามรบ
// กดซื้อ 2 ครั้ง (ครั้งแรกถามยืนยัน) กันกดพลาด
export function ShopPanel({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('skins');
  const [inv, setInv] = useState<Inventory | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [coins, setCoins] = useState(profile.coins);
  const [wearing, setWearing] = useState(profile.avatar.character);
  const [pulled, setPulled] = useState<PullResult[] | null>(null);
  const [pullKey, setPullKey] = useState(0); // เปลี่ยน = เล่นแอนิเมชันเปิดการ์ดใหม่

  useEffect(() => {
    let cancelled = false;
    fetchInventory()
      .then((i) => !cancelled && setInv(i))
      .catch((e) => {
        console.error('โหลดร้านค้าไม่ได้ (รัน supabase/migrations/009_shop.sql แล้วหรือยัง?)', e);
        if (!cancelled) setMsg({ ok: false, text: 'โหลดร้านค้าไม่ได้ ลองใหม่อีกครั้งนะ' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function purchase(item: string, label: string, price: number) {
    if (confirm !== item) {
      setConfirm(item);
      return;
    }
    setConfirm('');
    setBusy(item);
    setMsg(null);
    try {
      const r = await buy(item);
      setCoins(r.coins);
      setInv((prev) => new Map(prev).set(item, r.level));
      setMsg({ ok: true, text: `🎉 ได้ ${label} แล้ว! (ใช้ไป ${price} 🪙)` });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  }

  async function wear(character: string) {
    setBusy(character);
    setMsg(null);
    try {
      await saveProfile(profile.id, profile.username, { character }, false);
      setWearing(character);
      notifyWallet(); // ให้แอปโหลดโปรไฟล์ใหม่ (หน้าตาเปลี่ยน)
      setMsg({ ok: true, text: 'ใส่สกินแล้ว! เข้าเมืองใหม่หรือเข้าสนามรบเพื่อเห็นตัวใหม่' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  }

  async function spin(count: 1 | 10) {
    const id = `gacha:${count}`;
    if (confirm !== id) {
      setConfirm(id);
      return;
    }
    setConfirm('');
    setBusy(id);
    setMsg(null);
    try {
      const r = await pull(count);
      setCoins(r.coins);
      setPulled(r.results);
      setPullKey((k) => k + 1);
      // อัปเดตของที่มีตามผล
      setInv((prev) => {
        const next = new Map(prev);
        for (const x of r.results) if (!x.refund) next.set(x.item, x.level);
        return next;
      });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy('');
    }
  }

  const buyLabel = (item: string, price: number) => (confirm === item ? `ยืนยัน ${price} 🪙 ?` : `${price} 🪙`);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel shop-panel" onClick={(e) => e.stopPropagation()}>
        <div className="hub-head">
          <h1>🛒 ร้านค้า</h1>
          <span className="stat">🪙 {coins}</span>
          <button onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>
        <div className="level-tabs small">
          <button className={tab === 'skins' ? 'active' : ''} onClick={() => setTab('skins')}>
            ✨ สกินอนิเมะ
          </button>
          <button className={tab === 'perks' ? 'active' : ''} onClick={() => setTab('perks')}>
            ⚔️ อัปเกรด
          </button>
          <button className={tab === 'gacha' ? 'active' : ''} onClick={() => setTab('gacha')}>
            🎰 กาชา
          </button>
        </div>
        {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
        {!inv && !msg && <p className="muted">กำลังโหลด...</p>}

        {inv && tab === 'skins' && (
          <div className="shop-grid">
            {SKINS.map((s) => {
              const key = skinKey(s.id);
              const owned = ownsSkin(inv, s.id);
              const price = skinPrice(s.id);
              const sp = specialOf(key);
              return (
                <div key={s.id} className="shop-item" style={{ borderColor: RARITY[s.rarity].color }}>
                  <Faceset character={key} size={48} />
                  <strong>{s.name}</strong>
                  <small style={{ color: RARITY[s.rarity].color }}>{RARITY[s.rarity].name}</small>
                  <small className="muted">
                    {ELEMENTS[sp.ult.element].emoji} {sp.ult.name}
                  </small>
                  {owned ? (
                    wearing === key ? (
                      <button disabled>ใส่อยู่</button>
                    ) : (
                      <button className="primary" disabled={!!busy} onClick={() => wear(key)}>
                        ใส่เลย
                      </button>
                    )
                  ) : (
                    <button
                      className={confirm === `skin:${s.id}` ? 'primary' : ''}
                      disabled={!!busy || coins < price}
                      onClick={() => purchase(`skin:${s.id}`, `สกิน ${s.name}`, price)}
                    >
                      {busy === `skin:${s.id}` ? 'กำลังซื้อ...' : buyLabel(`skin:${s.id}`, price)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {inv && tab === 'perks' && (
          <div className="upgrade-list">
            {PERK_IDS.map((p) => {
              const u = PERKS[p];
              const lv = inv.get(`up:${p}`) ?? 0;
              const full = lv >= u.max;
              const price = u.price(lv + 1);
              const item = `up:${p}`;
              return (
                <div key={p} className="upgrade-card perk">
                  <span className="emoji">{u.emoji}</span>
                  <span>
                    <strong>
                      {u.name} <small>ขั้น {lv}/{u.max}</small>
                    </strong>
                    <small>{lv > 0 ? `ตอนนี้: ${u.desc(lv)}` : u.desc(1)}</small>
                    {!full && lv > 0 && <small className="muted">ขั้นถัดไป: {u.desc(lv + 1)}</small>}
                  </span>
                  {full ? (
                    <button disabled>ครบแล้ว</button>
                  ) : (
                    <button
                      className={confirm === item ? 'primary' : ''}
                      disabled={!!busy || coins < price}
                      onClick={() => purchase(item, `${u.name} ขั้น ${lv + 1}`, price)}
                    >
                      {busy === item ? 'กำลังซื้อ...' : buyLabel(item, price)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {inv && tab === 'gacha' && (
          <div className="gacha">
            <ul className="hub-rules">
              {GACHA_RATES.map((r) => (
                <li key={r.name}>
                  {r.emoji} <b>{r.name} {r.rate}%</b> — {r.desc}
                </li>
              ))}
              <li>🎁 หมุน 10 ครั้งได้การ์ดสกิลอย่างน้อย 1 ใบแน่นอน • ได้ของที่เต็มแล้ว คืน 30 🪙</li>
            </ul>
            <div className="row">
              {([1, 10] as const).map((n) => {
                const id = `gacha:${n}`;
                const price = GACHA_PRICE[n];
                return (
                  <button key={n} className={confirm === id ? 'primary' : ''} disabled={!!busy || coins < price} onClick={() => spin(n)}>
                    {busy === id ? 'กำลังหมุน...' : confirm === id ? `ยืนยัน ${price} 🪙 ?` : `หมุน ${n} ครั้ง (${price} 🪙)`}
                  </button>
                );
              })}
            </div>
            {pulled && (
              <div key={pullKey} className="gacha-results">
                {pulled.map((r, i) => {
                  const d = describePull(r);
                  return (
                    <div key={i} className={`gacha-card ${d.tier}`} style={{ animationDelay: `${i * 0.12}s` }}>
                      <span className="emoji">{d.emoji}</span>
                      <b>{d.name}</b>
                      <small>{d.sub}</small>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="gacha-owned">
              <strong>ของที่มี</strong>
              <span>
                {SHARD_IDS.map((g) => {
                  const lv = shardsOf(inv)[g];
                  return lv ? `${SHARDS[g].emoji} ${shardText(g, lv)} ` : '';
                }).join('') || 'ยังไม่มีเศษพลัง'}
              </span>
              <span>🃏 การ์ดสกิล {cardsOf(inv).length} ใบ (เลือกใช้ได้ตอนเข้าสนามรบ)</span>
            </div>
          </div>
        )}
        <p className="muted small">หาเหรียญได้จาก: โฟกัส • ทำงานเสร็จ • ดาวด่านคณิต • สนามรบ</p>
      </div>
    </div>
  );
}
