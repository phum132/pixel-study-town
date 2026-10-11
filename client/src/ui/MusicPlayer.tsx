import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loadYouTubeApi, parseYouTubeLink, resolveStation, STATIONS, type YTPlayer } from '../lib/music';

const VOLUME_KEY = 'pst-volume';
const PLAYING = 1; // YT.PlayerState.PLAYING

function savedVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 ? Math.min(v, 100) : 40;
  } catch {
    return 40;
  }
}

const YT_ERRORS: Record<number, string> = {
  2: 'ลิงก์ไม่ถูกต้อง',
  5: 'เล่นวิดีโอนี้ในเบราว์เซอร์นี้ไม่ได้',
  100: 'ไม่พบวิดีโอนี้ (อาจถูกลบหรือตั้งเป็นส่วนตัว)',
  101: 'เจ้าของวิดีโอไม่อนุญาตให้เปิดในเว็บอื่น',
  150: 'เจ้าของวิดีโอไม่อนุญาตให้เปิดในเว็บอื่น',
};

// homeMusic = เพลงประจำบ้านที่กำลังเยี่ยมอยู่ (ถ้ามี) จะขึ้นปุ่มชวนฟัง ไม่เปิดเองอัตโนมัติ
type Props = { homeMusic: { key: string; ownerName: string } | null };

// เครื่องเล่นเพลง lofi มุมซ้าย (ใต้แถบด้านบน)
export function MusicPlayer({ homeMusic }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [open, setOpen] = useState(false);
  const [stationKey, setStationKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(savedVolume);
  const volumeRef = useRef(volume); // ให้ตอน onReady ของ YouTube อ่านค่าล่าสุดได้
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [hasPlayer, setHasPlayer] = useState(false);

  useEffect(() => () => playerRef.current?.destroy(), []);

  async function play(key: string) {
    const station = resolveStation(key);
    if (!station) return;
    setStationKey(key);
    setError('');
    if (playerRef.current) {
      playerRef.current.loadVideoById(station.videoId);
      return;
    }
    try {
      const YT = await loadYouTubeApi();
      // YouTube จะแทนที่ div นี้ด้วย iframe จึงสร้าง div แยกไว้ข้างในกล่องที่ React ดูแล
      const el = document.createElement('div');
      hostRef.current!.appendChild(el);
      const player: YTPlayer = new YT.Player(el, {
        width: 200,
        height: 200,
        videoId: station.videoId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            player.setVolume(volumeRef.current);
            player.playVideo();
          },
          onStateChange: (e) => setPlaying(e.data === PLAYING),
          onError: (e) => {
            setPlaying(false);
            setError(YT_ERRORS[e.data] ?? `เล่นไม่ได้ (รหัส ${e.data})`);
          },
        },
      });
      playerRef.current = player;
      setHasPlayer(true);
      setHasPlayer(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function changeVolume(v: number) {
    volumeRef.current = v;
    setVolume(v);
    playerRef.current?.setVolume(v);
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      // เบราว์เซอร์ไม่ให้เก็บค่า ไม่เป็นไร
    }
  }

  function playLink(e: FormEvent) {
    e.preventDefault();
    const id = parseYouTubeLink(link);
    if (!id) {
      setError('ลิงก์ YouTube ไม่ถูกต้อง');
      return;
    }
    setLink('');
    play(`yt:${id}`);
  }

  const station = resolveStation(stationKey ?? undefined);
  const suggested = homeMusic ? resolveStation(homeMusic.key) : null;
  const showSuggestion = suggested && !(playing && stationKey === homeMusic?.key);
  // กฎของ YouTube: ระหว่างเล่นต้องเห็นกล่องวิดีโอ (ซ่อนได้เฉพาะตอนหยุดเล่น)
  const showVideo = hasPlayer && (playing || open);

  return (
    <section className={`music ${open ? 'open' : ''}`}>
      <div className="music-bar">
        <button onClick={() => setOpen(!open)} title="เลือกสถานีเพลง">
          🎵 {station ? `${station.emoji} ${station.name}` : 'เพลง lofi'} {open ? '▴' : '▾'}
        </button>
        {station && (
          <button
            className="icon"
            onClick={() => (playing ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo())}
            title={playing ? 'หยุด' : 'เล่น'}
          >
            {playing ? '⏸️' : '▶️'}
          </button>
        )}
      </div>

      {showSuggestion && (
        <div className="music-suggest">
          <span>
            🏠 {homeMusic!.ownerName} เปิด {suggested.emoji} {suggested.name}
          </span>
          <button className="primary" onClick={() => play(homeMusic!.key)}>
            ฟังด้วย
          </button>
        </div>
      )}

      <div className={`music-video ${showVideo ? '' : 'hidden'}`} ref={hostRef} />

      {open && (
        <div className="music-body">
          <div className="station-grid">
            {STATIONS.map((s) => (
              <button key={s.id} className={stationKey === s.id ? 'active' : ''} onClick={() => play(s.id)}>
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
          <form onSubmit={playLink} className="music-link">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="หรือวางลิงก์ YouTube" />
            <button>เล่น</button>
          </form>
          <label className="volume">
            🔊
            <input type="range" min={0} max={100} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} />
          </label>
        </div>
      )}
      {error && <small className="error">{error}</small>}
    </section>
  );
}
