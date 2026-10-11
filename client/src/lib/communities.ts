// รายชื่อคอมมู (id ต้องตรงกับ server/src/communities.ts)
export type Community = { id: string; name: string; emoji: string; desc: string };

export const COMMUNITIES: Community[] = [
  { id: 'general', name: 'ห้องนั่งเล่น', emoji: '🏠', desc: 'คุยเล่น ทักทาย หาเพื่อนอ่านหนังสือ' },
  { id: 'math', name: 'คณิตศาสตร์', emoji: '📐', desc: 'ถามโจทย์ ติวสูตร แชร์เทคนิค' },
  { id: 'science', name: 'วิทยาศาสตร์', emoji: '🔬', desc: 'ฟิสิกส์ เคมี ชีวะ' },
  { id: 'english', name: 'ภาษาอังกฤษ', emoji: '🔤', desc: 'ฝึกคุย ศัพท์ แกรมมาร์' },
  { id: 'coding', name: 'เขียนโค้ด', emoji: '💻', desc: 'โปรแกรมมิ่ง ทำโปรเจกต์ด้วยกัน' },
  { id: 'exam', name: 'ติวสอบเข้ามหาลัย', emoji: '🎓', desc: 'TGAT TPAT A-Level' },
];
