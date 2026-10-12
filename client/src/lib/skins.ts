// สกินอนิเมะ: ย้อมสีผม/ชุดของตัวละคร Ninja Adventure (CC0) เป็นลุคใหม่ ทำเองทั้งหมด ไม่มีลิขสิทธิ์ของใคร
// ภาพอยู่ที่ public/assets/characters/skin-<id>.png และ skin-<id>-face.png
// สร้างภาพใหม่ได้จากข้อมูลในไฟล์นี้ (สลับสีตรงตัวตามจานสีของชุดภาพ: สีต้นทาง → สีใหม่)
// ถ้าแก้สีหรือเพิ่มสกิน ให้สร้างภาพใหม่ด้วยสคริปต์สลับสี แล้วอย่าเปลี่ยน id เดิม (ผู้เล่นที่ซื้อแล้วจะหาไม่เจอ)

export type Rarity = 'common' | 'rare' | 'legend';
export type Skin = { id: string; name: string; rarity: Rarity; base: string; recolor: Record<string, string> };

export const RARITY: Record<Rarity, { name: string; color: string; price: number }> = {
  common: { name: 'ธรรมดา', color: '#b3a6c9', price: 150 },
  rare: { name: 'หายาก', color: '#6ec6ff', price: 400 },
  legend: { name: 'ตำนาน', color: '#ffcf5c', price: 1000 },
};

// สีของผม (หลัก, เงา) แบบอนิเมะ
const HAIR = {
  pink: ['ff8ec8', 'c9568f'],
  sky: ['6ec6ff', '3a7fc4'],
  silver: ['eceaf4', 'a9a7c0'],
  purple: ['b688ff', '7246c4'],
  mint: ['7ef0c4', '3fae8a'],
  gold: ['ffd966', 'd9a23a'],
  navy: ['4a5a9a', '2a2f5e'],
  crimson: ['ff4a5a', 'a8243a'],
} as const;

export const SKINS: Skin[] = [
  // ---- ธรรมดา ----
  { id: 'sakura', name: 'ซากุระ', rarity: 'common', base: 'Woman', recolor: { f1c471: HAIR.pink[0], d78b4a: HAIR.pink[1] } },
  { id: 'hikaru', name: 'ฮิคารุ', rarity: 'common', base: 'Boy', recolor: { d14b34: HAIR.gold[0], '965340': HAIR.gold[1], '548789': 'c9343f' } },
  { id: 'kaito', name: 'ไคโตะ', rarity: 'common', base: 'Boy', recolor: { d14b34: HAIR.navy[0], '965340': HAIR.navy[1], '548789': '2a3550' } },
  { id: 'hana', name: 'ฮานะ', rarity: 'common', base: 'Princess', recolor: { '4e484a': HAIR.pink[0], '3b3643': HAIR.pink[1], e0394c: '6ec6ff' } },
  { id: 'midori', name: 'มิโดริ', rarity: 'common', base: 'Cavegirl', recolor: { '56864c': HAIR.mint[0], '345a52': HAIR.mint[1] } },
  { id: 'aoi', name: 'อาโออิ', rarity: 'common', base: 'SorcererBlack', recolor: { e0394c: HAIR.sky[0], '8f3e56': HAIR.sky[1] } },
  // ---- หายาก ----
  { id: 'yuki', name: 'ยูกิ', rarity: 'rare', base: 'Woman', recolor: { f1c471: HAIR.silver[0], d78b4a: HAIR.silver[1], '548789': '2f3b6b', '79b8ce': '5f74c4' } },
  { id: 'kuro', name: 'คุโระ', rarity: 'rare', base: 'Villager3', recolor: { '4e484a': HAIR.silver[0], '3b3643': HAIR.silver[1], a8a129: '2b2b3a', '56864c': '1d1d28' } },
  { id: 'shinobu', name: 'ชิโนบุ', rarity: 'rare', base: 'NinjaBlue', recolor: { '79b8ce': HAIR.purple[0], '5f7160': HAIR.purple[1] } },
  { id: 'rei', name: 'เรย์', rarity: 'rare', base: 'SorcererBlack', recolor: { e0394c: HAIR.purple[0], '8f3e56': HAIR.purple[1], '4e484a': '2a2f5e' } },
  // ---- ตำนาน ----
  { id: 'akane', name: 'อาคาเนะ', rarity: 'legend', base: 'NinjaBlue', recolor: { '79b8ce': HAIR.crimson[0], '5f7160': '2b1d26', f2eaf1: HAIR.gold[0] } },
  { id: 'ryuo', name: 'ราชันมังกร', rarity: 'legend', base: 'Samurai', recolor: { f2ad7d: '3a3550', ffcba9: '5a5478', e0394c: HAIR.gold[0], d14b34: HAIR.gold[1], '8f3e56': '1d1a2b' } },
];

export const skinKey = (id: string) => `skin-${id}`;
export const SKIN_BY_KEY = new Map(SKINS.map((s) => [skinKey(s.id), s]));
