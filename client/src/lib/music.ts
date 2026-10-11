// สถานีเพลง lofi จาก YouTube (ไลฟ์สดที่เจ้าของช่องเปิดให้ฝังในเว็บอื่นได้)
// เล่นผ่าน YouTube IFrame Player ตามกฎของ YouTube: ต้องแสดงกล่องวิดีโออย่างน้อย 200x200px ตอนเล่น

export type Station = { id: string; name: string; emoji: string; videoId: string };

export const STATIONS: Station[] = [
  { id: 'study', name: 'Lofi อ่านหนังสือ', emoji: '📚', videoId: 'jfKfPfyJRdk' },
  { id: 'jazz', name: 'Jazz Lofi', emoji: '🎷', videoId: 'HuFYqnbVbzY' },
  { id: 'asian', name: 'Asian Lofi', emoji: '⛩️', videoId: 'Na0w3Mz46GA' },
  { id: 'sleep', name: 'Lofi นอนหลับ', emoji: '💤', videoId: 'rUxyKA_-grg' },
  { id: 'synthwave', name: 'Synthwave', emoji: '🌌', videoId: '4xDzrJKXOOY' },
  { id: 'chillhop', name: 'Chillhop', emoji: '🐾', videoId: '5yx6BWlEVcY' },
];

// รหัสเพลงที่เก็บไว้: id ของสถานีด้านบน หรือ "yt:<รหัสวิดีโอ>" สำหรับลิงก์ที่วางเอง
export function resolveStation(key: string | undefined): Station | null {
  if (!key) return null;
  const preset = STATIONS.find((s) => s.id === key);
  if (preset) return preset;
  const videoId = key.startsWith('yt:') ? key.slice(3) : '';
  return VIDEO_ID.test(videoId) ? { id: key, name: 'ลิงก์ YouTube', emoji: '🎵', videoId } : null;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// รับลิงก์ YouTube ได้หลายแบบ: youtube.com/watch?v=..., youtu.be/..., youtube.com/live/...
export function parseYouTubeLink(input: string): string | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'music.youtube.com') {
      id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:live|embed|shorts)\/([^/?]+)/)?.[1] ?? null;
    }
    return id && VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

// ---------- โหลดสคริปต์ YouTube IFrame API ครั้งเดียว ----------

type YTPlayerOptions = {
  width: number;
  height: number;
  videoId: string;
  playerVars: Record<string, number | string>;
  events: {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
    onError?: (e: { data: number }) => void;
  };
};

export type YTPlayer = {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  setVolume(v: number): void;
  destroy(): void;
};

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer; PlayerState: { PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<NonNullable<Window['YT']>> | null = null;

export function loadYouTubeApi() {
  apiPromise ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('โหลดเครื่องเล่น YouTube ไม่ได้ (อินเทอร์เน็ตหลุดหรือถูกบล็อก?)'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}
