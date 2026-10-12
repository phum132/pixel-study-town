import type { HomeData, Placed } from './home';

// ตึกสาธารณะในเมือง: ทุกคนในคอมมูเดียวกันเข้าห้องเดียวกัน แต่งไว้แล้ว แก้ไม่ได้
// id ต้องตรงกับ PLACE_IDS ใน server/src/rooms/PlaceRoom.ts และวัตถุ door (place=...) ใน town.json
// ห้องขนาดเดียวกับบ้าน 12x9 ช่อง: แถว 0-1 ผนัง, แถว 2-8 พื้น, ประตูกลางแถวล่าง (ช่อง 5-6)
// เฟอร์นิเจอร์ส่วนใหญ่เป็นชุด Ninja (id ขึ้นต้น n_) ให้เข้ากับเมือง ส่วนเก้าอี้ที่หันได้ 4 ทิศยังใช้ชุดเดิม

export type Place = { id: string; name: string; emoji: string; desc: string; room: HomeData };

const row = (i: string, xs: number[], y: number): Placed[] => xs.map((x) => ({ i, x, y }));
// โต๊ะ 1 ช่อง + เก้าอี้ 4 ทิศหันเข้าหาโต๊ะ = กลุ่มติว 4 คน (เก้าอี้เดินทับได้ ยืนบนเก้าอี้ = นั่ง)
const pod = (table: string, x: number, y: number): Placed[] => [
  { i: table, x, y },
  { i: 'chair_front', x, y: y - 1 },
  { i: 'chair_back', x, y: y + 1 },
  { i: 'chair_right', x: x - 1, y },
  { i: 'chair_left', x: x + 1, y },
];

export const PLACES: Place[] = [
  {
    id: 'library',
    name: 'ห้องสมุด',
    emoji: '📚',
    desc: 'มุมอ่านหนังสือเงียบๆ',
    room: {
      isPublic: true,
      theme: { floor: 'wood', floorColor: '#8a5a3b', wall: 'stripe', wallColor: '#c9e0e8' },
      layout: [
        // ห้องสมุด: ตู้หนังสือเต็มผนัง โต๊ะยาว 4 ตัว 18 ที่นั่ง กระดานประกาศกลางผนัง (จะใช้เป็นกระดานถาม-ตอบ)
        { i: 'n_painting_mountain', x: 1, y: 0 },
        { i: 'n_frame', x: 2, y: 0 },
        { i: 'n_notice', x: 4, y: 0 },
        { i: 'n_painting_round', x: 9, y: 0 },
        { i: 'n_frame', x: 10, y: 0 },
        { i: 'n_bookcase', x: 0, y: 2 },
        { i: 'n_bookcase', x: 2, y: 2 },
        { i: 'n_bookcase', x: 8, y: 2 },
        { i: 'n_bookcase', x: 10, y: 2 },
        { i: 'n_plant', x: 4, y: 2 },
        { i: 'n_plant', x: 7, y: 2 },
        { i: 'rug_green', x: 5, y: 3 },
        { i: 'rug_green', x: 5, y: 5 },
        { i: 'rug_cream', x: 5, y: 7 },
        ...row('chair_front', [1, 2, 3, 8, 9, 10], 4),
        { i: 'n_table_long', x: 1, y: 5 },
        { i: 'n_table_long', x: 8, y: 5 },
        ...row('chair_back', [1, 2, 3, 8, 9, 10], 6),
        ...row('chair_front', [1, 2, 3, 8, 9, 10], 7),
        { i: 'n_table_long', x: 1, y: 8 },
        { i: 'n_table_long', x: 8, y: 8 },
      ],
    },
  },
  {
    id: 'shrine',
    name: 'ห้องสมาธิ',
    emoji: '🧘',
    desc: 'นั่งโฟกัสเงียบๆ ด้วยกัน',
    room: {
      isPublic: true,
      theme: { floor: 'carpet', floorColor: '#a35d6a', wall: 'plain', wallColor: '#e8dcc0' },
      layout: [
        // ห้องสมาธิ: 12 ที่นั่ง เว้นช่องระหว่างคน มีแท่นบูชาด้านหน้า
        { i: 'n_curtain', x: 1, y: 0 },
        { i: 'n_painting_round', x: 5, y: 0 },
        { i: 'n_painting_mountain', x: 6, y: 0 },
        { i: 'n_curtain', x: 8, y: 0 },
        { i: 'n_plant', x: 0, y: 2 },
        { i: 'n_plant', x: 11, y: 2 },
        { i: 'n_pot', x: 4, y: 2 },
        { i: 'n_table_cloth', x: 5, y: 2 },
        { i: 'n_table_cloth', x: 6, y: 2 },
        { i: 'n_pot', x: 7, y: 2 },
        { i: 'rug_red', x: 1, y: 4 },
        { i: 'rug_red', x: 8, y: 4 },
        { i: 'rug_red', x: 1, y: 6 },
        { i: 'rug_red', x: 8, y: 6 },
        { i: 'rug_green', x: 5, y: 4 },
        { i: 'rug_green', x: 5, y: 6 },
        ...row('stool', [1, 3, 8, 10], 4),
        ...row('stool', [1, 3, 8, 10], 6),
        ...row('stool', [1, 3, 8, 10], 8),
        { i: 'n_plant', x: 0, y: 8 },
        { i: 'n_plant', x: 11, y: 8 },
      ],
    },
  },
  {
    id: 'cafe',
    name: 'คาเฟ่',
    emoji: '🍵',
    desc: 'นั่งคุยเล่น พักสมอง',
    room: {
      isPublic: true,
      theme: { floor: 'tile', floorColor: '#d9b38c', wall: 'dots', wallColor: '#f2c9d0' },
      layout: [
        // คาเฟ่: โต๊ะ 3 ตัว ตัวละ 4 ที่ + บาร์ 3 ที่ + โซฟา 2 ที่ กระดานเมนูบนผนัง
        { i: 'n_frame', x: 1, y: 0 },
        { i: 'n_painting_mountain', x: 2, y: 0 },
        { i: 'n_notice', x: 4, y: 0 },
        { i: 'n_painting_round', x: 8, y: 0 },
        { i: 'n_frame', x: 10, y: 0 },
        { i: 'n_plant', x: 0, y: 2 },
        { i: 'armchair_orange', x: 5, y: 2 },
        { i: 'armchair_green', x: 6, y: 2 },
        { i: 'rug_cream', x: 5, y: 3 },
        { i: 'n_table_long', x: 8, y: 2 },
        { i: 'n_stove', x: 11, y: 2 },
        { i: 'n_barrel', x: 11, y: 3 },
        ...row('stool', [8, 9, 10], 3),
        ...pod('n_table', 2, 4),
        ...pod('n_table', 2, 7),
        ...pod('n_table', 9, 6),
        { i: 'n_plant', x: 0, y: 8 },
        { i: 'n_plant', x: 11, y: 8 },
      ],
    },
  },
  {
    id: 'ramen',
    name: 'ร้านราเมน',
    emoji: '🍜',
    desc: 'กินราเมนกับเพื่อน',
    room: {
      isPublic: true,
      theme: { floor: 'wood', floorColor: '#b07a4f', wall: 'plain', wallColor: '#4a3d66' },
      layout: [
        // ร้านราเมน: ผ้าม่านแดงหน้าร้าน ครัวหลังเคาน์เตอร์ยาว 8 ที่ + โต๊ะ 2 ตัว
        { i: 'n_curtain', x: 1, y: 0 },
        { i: 'n_painting_mountain', x: 5, y: 0 },
        { i: 'n_frame', x: 6, y: 0 },
        { i: 'n_curtain', x: 8, y: 0 },
        { i: 'n_plant', x: 0, y: 2 },
        { i: 'n_plant', x: 11, y: 2 },
        { i: 'n_stove', x: 3, y: 2 },
        { i: 'n_stove', x: 4, y: 2 },
        { i: 'n_pot', x: 5, y: 2 },
        { i: 'n_barrel', x: 8, y: 2 },
        { i: 'n_barrel', x: 9, y: 2 },
        { i: 'n_table_long', x: 2, y: 3 },
        { i: 'n_table_long', x: 5, y: 3 },
        { i: 'n_table', x: 8, y: 3 },
        { i: 'n_table', x: 9, y: 3 },
        ...row('stool', [2, 3, 4, 5, 6, 7, 8, 9], 4),
        ...pod('n_table_cloth', 2, 6),
        ...pod('n_table_cloth', 9, 6),
        { i: 'rug_red', x: 0, y: 7 },
        { i: 'rug_red', x: 9, y: 7 },
      ],
    },
  },
];

export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));
