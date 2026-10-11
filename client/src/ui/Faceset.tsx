import { faceUrl } from '../lib/characters';

// รูปหน้าตัวละคร (38x38 จากชุดภาพ) ใช้ที่แถบด้านบนและหน้าเลือกตัวละคร
export function Faceset({ character, size = 32 }: { character: string; size?: number }) {
  return <img src={faceUrl(character)} alt={character} className="pixel faceset" width={size} height={size} />;
}
