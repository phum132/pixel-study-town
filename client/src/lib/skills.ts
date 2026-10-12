import { SKIN_BY_KEY } from './skins';

// สกิลในสนามรบ: ธาตุ 8 x รูปแบบ 8 = สกิลพื้นฐาน 64 แบบ
// ผสมได้ 2 ทาง: ธาตุต่างกันแต่รูปแบบเดียวกัน (224 แบบ) หรือธาตุเดียวกันแต่รูปแบบต่างกัน (224 แบบ) รวมทั้งหมด 512 สกิล
// ไม่มี Phaser ในไฟล์นี้ (ฉากเกมอ่านข้อมูลจากที่นี่ไปทำภาพและผล)

export type Element = 'fire' | 'ice' | 'thunder' | 'wind' | 'earth' | 'light' | 'dark' | 'poison';
export type Form = 'bolt' | 'bomb' | 'orbit' | 'rain' | 'nova' | 'beam' | 'trap' | 'slash';

export const ELEMENTS: Record<Element, { name: string; emoji: string; color: number; effect: string }> = {
  fire: { name: 'เพลิง', emoji: '🔥', color: 0xff6a3a, effect: 'ติดไฟ เสียเลือดต่อเนื่อง' },
  ice: { name: 'น้ำแข็ง', emoji: '❄️', color: 0x8fe3ff, effect: 'ทำให้มอนช้าลงครึ่งหนึ่ง' },
  thunder: { name: 'อัสนี', emoji: '⚡', color: 0xffe14a, effect: 'ไฟฟ้ากระโดดไปโดนอีก 2 ตัว' },
  wind: { name: 'วายุ', emoji: '🌪️', color: 0xc8ffe8, effect: 'ผลักมอนกระเด็น' },
  earth: { name: 'ศิลา', emoji: '🪨', color: 0xd09050, effect: 'แรงขึ้น 25% และทำให้มึน' },
  light: { name: 'แสง', emoji: '✨', color: 0xfff3a0, effect: 'ติดคริติคอลแรงสองเท่า' },
  dark: { name: 'เงา', emoji: '🌑', color: 0xa070ff, effect: 'ดูดเลือดมาเป็นของเรา' },
  poison: { name: 'พิษ', emoji: '☠️', color: 0x7fe06a, effect: 'พิษกัดกิน และแพร่ไปตัวข้างๆ ตอนตาย' },
};

// dmg = ความแรงต่อการโดน 1 ครั้งที่เลเวล 1 / cd = วินาทีต่อการใช้ 1 ครั้ง
export const FORMS: Record<Form, { name: string; emoji: string; dmg: number; cd: number; desc: string }> = {
  bolt: { name: 'ลูกศร', emoji: '🏹', dmg: 14, cd: 1.1, desc: 'ยิงพุ่งใส่มอนที่ใกล้สุด' },
  bomb: { name: 'ระเบิด', emoji: '💣', dmg: 22, cd: 2.2, desc: 'โยนลูกระเบิดตูมเป็นวง' },
  orbit: { name: 'วงโคจร', emoji: '🌀', dmg: 9, cd: 0.4, desc: 'ลูกพลังหมุนรอบตัว' },
  rain: { name: 'ฝน', emoji: '🌧️', dmg: 18, cd: 1.6, desc: 'ตกใส่มอนหลายตัวพร้อมกัน' },
  nova: { name: 'คลื่น', emoji: '💫', dmg: 16, cd: 2.6, desc: 'คลื่นพลังแผ่ออกรอบตัว' },
  beam: { name: 'รังสี', emoji: '🔆', dmg: 20, cd: 2.0, desc: 'ลำแสงยาวทะลุทุกตัวในแนว' },
  trap: { name: 'กับดัก', emoji: '🕸️', dmg: 7, cd: 2.4, desc: 'วางวงเวทบนพื้น ใครเหยียบโดนรัวๆ' },
  slash: { name: 'ดาบ', emoji: '⚔️', dmg: 18, cd: 1.0, desc: 'ฟันเป็นวงโค้งข้างหน้า' },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS) as Element[];
export const FORM_IDS = Object.keys(FORMS) as Form[];
export const MAX_SKILL_LEVEL = 5;
export const MAX_SKILLS = 5; // ช่องสกิลพร้อมกันได้สูงสุด (ผสมแล้วคืนช่อง 1 ช่อง)
export const FUSE_LEVEL = 3; // ทั้งสองสกิลต้องถึงเลเวลนี้ถึงผสมได้

export type SkillDef = { id: string; elements: Element[]; forms: Form[]; name: string; emoji: string; fused: boolean };

export const skillId = (elements: Element[], forms: Form[]) =>
  `${[...elements].sort().join('+')}:${[...forms].sort().join('+')}`;

function define(elements: Element[], forms: Form[]): SkillDef {
  const fused = elements.length + forms.length > 2;
  const name = forms.map((f) => FORMS[f].name).join('') + elements.map((e) => ELEMENTS[e].name).join('');
  const emoji = elements.map((e) => ELEMENTS[e].emoji).join('') + forms.map((f) => FORMS[f].emoji).join('');
  return { id: skillId(elements, forms), elements, forms, name: fused ? `${name}` : name, emoji, fused };
}

// สร้างครบทุกแบบ (512)
export const SKILLS: SkillDef[] = (() => {
  const list: SkillDef[] = [];
  for (const e of ELEMENT_IDS) for (const f of FORM_IDS) list.push(define([e], [f]));
  for (let i = 0; i < ELEMENT_IDS.length; i++)
    for (let j = i + 1; j < ELEMENT_IDS.length; j++) for (const f of FORM_IDS) list.push(define([ELEMENT_IDS[i], ELEMENT_IDS[j]], [f]));
  for (const e of ELEMENT_IDS)
    for (let i = 0; i < FORM_IDS.length; i++) for (let j = i + 1; j < FORM_IDS.length; j++) list.push(define([e], [FORM_IDS[i], FORM_IDS[j]]));
  return list;
})();
export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
export const BASE_SKILLS = SKILLS.filter((s) => !s.fused);

// ผลของการผสม a + b (ได้เฉพาะสกิลพื้นฐาน 2 อันที่ใช้ธาตุเดียวกันหรือรูปแบบเดียวกัน)
export function fusionOf(a: SkillDef, b: SkillDef): SkillDef | null {
  if (a.fused || b.fused || a.id === b.id) return null;
  if (a.forms[0] === b.forms[0]) return SKILL_BY_ID.get(skillId([a.elements[0], b.elements[0]], a.forms)) ?? null;
  if (a.elements[0] === b.elements[0]) return SKILL_BY_ID.get(skillId(a.elements, [a.forms[0], b.forms[0]])) ?? null;
  return null;
}

export function describeSkill(s: SkillDef) {
  return [...s.forms.map((f) => FORMS[f].desc), ...s.elements.map((e) => ELEMENTS[e].effect)].join(' • ');
}

// ---------- ท่าไม้ตาย + สกิลเริ่มต้นประจำตัวละคร ----------
// kind = รูปแบบท่าไม้ตาย (ฉากเกมรู้วิธีเล่นแต่ละแบบ)
export type UltKind = 'storm' | 'nova' | 'freeze' | 'chain' | 'blades' | 'meteor' | 'spin' | 'garden';
export type Special = { start: string; ult: { name: string; kind: UltKind; element: Element; heal?: number } };

const SKIN_SPECIALS: Record<string, Special> = {
  sakura: { start: skillId(['light'], ['rain']), ult: { name: 'พายุซากุระโปรยปราย', kind: 'storm', element: 'light', heal: 30 } },
  hikaru: { start: skillId(['thunder'], ['slash']), ult: { name: 'ดาบสายฟ้าทองคำ', kind: 'chain', element: 'thunder' } },
  kaito: { start: skillId(['ice'], ['bolt']), ult: { name: 'คลื่นยักษ์ถล่มฟ้า', kind: 'nova', element: 'ice' } },
  hana: { start: skillId(['poison'], ['trap']), ult: { name: 'สวนดอกไม้มรณะ', kind: 'garden', element: 'poison' } },
  midori: { start: skillId(['poison'], ['orbit']), ult: { name: 'ป่าพิโรธ', kind: 'garden', element: 'poison', heal: 40 } },
  aoi: { start: skillId(['wind'], ['nova']), ult: { name: 'ลมฟ้าพิฆาต', kind: 'nova', element: 'wind' } },
  yuki: { start: skillId(['ice'], ['orbit']), ult: { name: 'ยุคน้ำแข็ง', kind: 'freeze', element: 'ice' } },
  kuro: { start: skillId(['dark'], ['slash']), ult: { name: 'ดาบเงาพันเล่ม', kind: 'blades', element: 'dark', heal: 20 } },
  shinobu: { start: skillId(['dark'], ['bolt']), ult: { name: 'คาถาเงาพันร่าง', kind: 'blades', element: 'dark' } },
  rei: { start: skillId(['fire'], ['bomb']), ult: { name: 'อุกกาบาตสีม่วง', kind: 'meteor', element: 'fire' } },
  akane: { start: skillId(['fire'], ['nova']), ult: { name: 'เพลิงโลกันตร์', kind: 'nova', element: 'fire' } },
  ryuo: { start: skillId(['light'], ['beam']), ult: { name: 'มังกรทองคำหมุนฟ้า', kind: 'spin', element: 'light' } },
};

// ตัวละครฟรี: ได้ธาตุตามชื่อ (เช่น NinjaFire = ไฟ) แล้วท่าไม้ตายตามธาตุ
const KEYWORDS: [RegExp, Element][] = [
  [/Fire|Flam|Red|Demon/i, 'fire'],
  [/Water|Blue|Eskimo|Ice/i, 'ice'],
  [/Thunder|Yellow|Gold/i, 'thunder'],
  [/Leaf|Green|Frog|Pig|Bamboo/i, 'poison'],
  [/Dark|Black|Skeleton|Vampire|Mask|Gray/i, 'dark'],
  [/Monk|Master|Statue|Princess|Noble|Sultan|Spirit|Woman/i, 'light'],
  [/Cave|Rock|Robot|Lion|Gladiator|Knight|Monkey/i, 'earth'],
];
const ELEMENT_ULT: Record<Element, { name: string; kind: UltKind; form: Form }> = {
  fire: { name: 'ระเบิดเพลิงสุริยะ', kind: 'meteor', form: 'bomb' },
  ice: { name: 'พายุหิมะ', kind: 'freeze', form: 'bolt' },
  thunder: { name: 'เทพอัสนีบาต', kind: 'chain', form: 'rain' },
  wind: { name: 'ทอร์นาโดคลั่ง', kind: 'nova', form: 'slash' },
  earth: { name: 'แผ่นดินแยก', kind: 'storm', form: 'bomb' },
  light: { name: 'แสงศักดิ์สิทธิ์', kind: 'storm', form: 'beam' },
  dark: { name: 'ราตรีนิรันดร์', kind: 'blades', form: 'slash' },
  poison: { name: 'หมอกพิษกลืนโลก', kind: 'garden', form: 'trap' },
};

export function specialOf(character: string): Special & { element: Element } {
  const skin = SKIN_BY_KEY.get(character);
  if (skin && SKIN_SPECIALS[skin.id]) return { ...SKIN_SPECIALS[skin.id], element: SKIN_SPECIALS[skin.id].ult.element };
  const element = KEYWORDS.find(([re]) => re.test(character))?.[1] ?? 'wind';
  const u = ELEMENT_ULT[element];
  return { element, start: skillId([element], [u.form]), ult: { name: u.name, kind: u.kind, element } };
}
