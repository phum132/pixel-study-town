import { supabase } from './supabase';
import { FURNITURE_BY_ID, type Furniture } from './furniture';

// ขนาดห้อง (ต้องตรงกับ HomeRoom ในเซิร์ฟเวอร์): กว้าง 12 ช่อง สูง 9 ช่อง
// แถว 0-1 = ผนัง (แขวนของได้), แถว 2-8 = พื้น, ประตูอยู่กลางแถวล่างสุด
export const ROOM_COLS = 12;
export const ROOM_ROWS = 9;
export const WALL_ROWS = 2;
export const DOOR_COLS = [5, 6];

export type FloorStyle = 'wood' | 'tile' | 'carpet';
export type WallStyle = 'plain' | 'stripe' | 'dots';
export type Theme = { floor: FloorStyle; floorColor: string; wall: WallStyle; wallColor: string };
export type Placed = { i: string; x: number; y: number };
export type HomeData = { theme: Theme; layout: Placed[]; isPublic: boolean };

export const FLOOR_STYLES: { id: FloorStyle; name: string }[] = [
  { id: 'wood', name: 'ไม้' },
  { id: 'tile', name: 'กระเบื้อง' },
  { id: 'carpet', name: 'พรมทั้งห้อง' },
];
export const WALL_STYLES: { id: WallStyle; name: string }[] = [
  { id: 'plain', name: 'เรียบ' },
  { id: 'stripe', name: 'ลายทาง' },
  { id: 'dots', name: 'ลายจุด' },
];
export const FLOOR_COLORS = ['#b07a4f', '#8a5a3b', '#d9b38c', '#7d8a99', '#6f8f6a', '#a35d6a'];
export const WALL_COLORS = ['#e8dcc0', '#c9e0e8', '#f2c9d0', '#d6e8c9', '#e0d0f0', '#4a3d66'];

export const DEFAULT_THEME: Theme = { floor: 'wood', floorColor: '#b07a4f', wall: 'stripe', wallColor: '#e8dcc0' };

// ห้องเริ่มต้นของผู้เล่นใหม่
export const DEFAULT_LAYOUT: Placed[] = [
  { i: 'rug_red', x: 4, y: 4 },
  { i: 'bed_single_orange', x: 1, y: 2 },
  { i: 'bookshelf', x: 3, y: 2 },
  { i: 'plant_big', x: 10, y: 2 },
  { i: 'table_square', x: 8, y: 5 },
  { i: 'chair_left', x: 9, y: 5 },
  { i: 'painting_map', x: 6, y: 0 },
  { i: 'frames_small', x: 1, y: 0 },
];

// ช่องที่ของชิ้นนี้ทับอยู่
function cells(item: Furniture, x: number, y: number) {
  const out: string[] = [];
  for (let dy = 0; dy < item.h; dy++) for (let dx = 0; dx < item.w; dx++) out.push(`${x + dx},${y + dy}`);
  return out;
}

// ของที่ "ชั้น" เดียวกันจะวางทับกันไม่ได้ (แต่วางโต๊ะบนพรมได้)
export function canPlace(layout: Placed[], item: Furniture, x: number, y: number): boolean {
  if (x < 0 || x + item.w > ROOM_COLS) return false;
  if (item.kind === 'wall') {
    if (y < 0 || y + item.h > WALL_ROWS) return false;
  } else if (y < WALL_ROWS || y + item.h > ROOM_ROWS) {
    return false;
  }
  const mine = new Set(cells(item, x, y));
  if (item.kind === 'floor' && DOOR_COLS.some((c) => mine.has(`${c},${ROOM_ROWS - 1}`))) return false; // ห้ามขวางประตู
  return layout.every((p) => {
    const other = FURNITURE_BY_ID.get(p.i);
    if (!other || other.kind !== item.kind) return true;
    return cells(other, p.x, p.y).every((c) => !mine.has(c));
  });
}

// หาของที่อยู่ในช่องนี้ (ของบนพื้น/ผนังมาก่อนพรม) คืนค่าเป็นตำแหน่งใน layout
export function itemAt(layout: Placed[], x: number, y: number): number {
  let rug = -1;
  for (let n = layout.length - 1; n >= 0; n--) {
    const p = layout[n];
    const item = FURNITURE_BY_ID.get(p.i);
    if (!item || !cells(item, p.x, p.y).includes(`${x},${y}`)) continue;
    if (item.kind !== 'rug') return n;
    if (rug < 0) rug = n;
  }
  return rug;
}

// ข้อมูลในฐานข้อมูลอาจมาจากเวอร์ชันเก่า: เติมค่าที่หายไป และตัดของที่ไม่รู้จักออก
function clean(theme: Partial<Theme> | null, layout: unknown): Pick<HomeData, 'theme' | 'layout'> {
  const list = Array.isArray(layout) ? layout : [];
  return {
    theme: { ...DEFAULT_THEME, ...theme },
    layout: list.filter(
      (p): p is Placed => p && FURNITURE_BY_ID.has(p.i) && Number.isInteger(p.x) && Number.isInteger(p.y),
    ),
  };
}

export async function fetchHome(ownerId: string): Promise<HomeData> {
  const { data, error } = await supabase
    .from('rooms')
    .select('theme, layout, is_public')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { theme: DEFAULT_THEME, layout: DEFAULT_LAYOUT, isPublic: true };
  return { ...clean(data.theme, data.layout), isPublic: data.is_public };
}

// แก้ห้องเดิมก่อน ถ้ายังไม่เคยมีห้องค่อยสร้างใหม่
// (ไม่ใช้ upsert เพราะ upsert ต้องมีสิทธิ์แก้ owner_id ซึ่งเราห้ามไว้ใน 002_rooms.sql เพื่อกันการย้ายห้องไปเป็นของคนอื่น)
export async function saveHome(ownerId: string, home: HomeData) {
  const fields = { theme: home.theme, layout: home.layout, is_public: home.isPublic };
  const { data, error } = await supabase.from('rooms').update(fields).eq('owner_id', ownerId).select('owner_id');
  if (error) throw error;
  if (data.length > 0) return;
  const { error: insertError } = await supabase.from('rooms').insert({ owner_id: ownerId, ...fields });
  if (insertError) throw insertError;
}

export async function fetchUsername(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
  return data?.username ?? 'ไม่ทราบชื่อ';
}

// โหลดแผ่นภาพเฟอร์นิเจอร์ครั้งเดียว ใช้ทำไอคอนในหน้าแต่งห้อง
let sheetPromise: Promise<HTMLImageElement> | null = null;
export function loadFurnitureSheet() {
  sheetPromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = '/assets/tiles/roguelike-indoor.png';
  });
  return sheetPromise;
}
