# Pixel Study Town 🏘️📚

**English** | [ภาษาไทย](README.th.md)

A cozy pixel-art town where people study together. Walk around with friends, chat, decorate your own room, track your to-dos, focus with a Pomodoro timer and listen to lofi music.

> 🚧 Work in progress. Phases 0–6 of 10 are done; the minigame, ranking and public launch are next.

## Features

- 🏘️ **Pixel town** you walk around in (keyboard, or tap-and-drag on mobile)
- 👤 **Accounts and characters** with email login and custom hair, skin, shirt and pants colors
- 👥 **Real-time multiplayer**: see others walk, chat with speech bubbles, join one of 6 study communities
- 🏠 **Personal homes**: place furniture, pick floor and wall themes, visit friends' homes, or make yours private
- 📝 **To-do list**: choose per task whether visitors can see it
- ⏱️ **Pomodoro timer** (15/25/50 min plus breaks). Focusing players show 📖 above their heads.
- 🎵 **Lofi radio** with 6 YouTube live stations or your own link, plus a "home music" setting visitors can join

### Anti-cheat by design

The browser is never trusted with anything that counts toward ranking:

- The game server checks movement speed and rejects teleporting.
- Player names come from the database, not from the browser.
- **Focus time is measured by the database clock** (`start_focus` / `finish_focus`), so changing your PC clock does nothing.
- Row Level Security means you can only edit your own profile, room and tasks. Players cannot write XP or coins at all.

## Tech stack

| Part | Tool |
|---|---|
| Web app | [Vite](https://vite.dev) + [React](https://react.dev) + TypeScript |
| Game engine | [Phaser 3](https://phaser.io) (town map made in [Tiled](https://www.mapeditor.org) format) |
| Login, database | [Supabase](https://supabase.com) (Postgres + Auth + Row Level Security) |
| Real-time server | [Colyseus 0.16](https://colyseus.io) (Node.js) |
| Music | YouTube IFrame Player API |

## Project structure

```
client/                  Web app (what players see)
  src/game/              Phaser scenes: TownScene, HomeScene, WorldScene (shared), avatar, character
  src/ui/                React panels: login, character editor, chat, room editor, to-do, timer, music
  src/lib/               Supabase/Colyseus connections, furniture list, room rules, focus timer
  public/assets/         Tile sheets, town map (town.json), LICENSES.md
  tools/make-town-map.mjs  Generates town.json (⚠️ overwrites edits made in Tiled)
server/                  Game server (movement, chat, homes)
  src/rooms/             WorldRoom (shared), TownRoom, HomeRoom
supabase/migrations/     SQL files that create the database tables and rules
```

## Running it on your computer

### 1. Install

- [Node.js](https://nodejs.org) 22 or newer
- Install packages:
  ```bash
  cd client && npm install
  cd ../server && npm install
  ```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com) (Singapore region if you are in Southeast Asia).
2. Open **SQL Editor → New query** and run each file in `supabase/migrations/` **once, in order**:
   `001_profiles.sql` → `002_rooms.sql` → `003_todos_focus.sql`
3. For local testing only: **Authentication → Sign In / Providers → Email** → turn off **Confirm email**, so you can make test accounts without real inboxes. Turn it back on before going public.

### 3. Create the `.env` files

Copy each `.env.example` to `.env` and fill in the values from **Project Settings → API Keys**:

- `client/.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`
- `server/.env` → `SUPABASE_URL`, `SUPABASE_KEY`

Use the **publishable** key (`sb_publishable_...`). It is safe in a browser because the database rules protect the data.
⚠️ Never put the **secret / service_role** key in these files or in git.

### 4. Start both servers (two terminals)

```bash
# Terminal 1: game server, port 2567
cd server && npm run dev

# Terminal 2: web app, port 5173 (--host lets phones on the same Wi-Fi join)
cd client && npm run dev -- --host
```

Open http://localhost:5173. To test multiplayer, open a second account in an incognito window.

## Roadmap

- [x] Phase 0–1: setup, pixel town, walking and collisions
- [x] Phase 2: accounts and character customizer
- [x] Phase 3: multiplayer, chat, communities
- [x] Phase 4: personal homes, decorating, themes, visiting
- [x] Phase 5: to-do list and server-timed Pomodoro
- [x] Phase 6: lofi music
- [ ] Phase 7: Snake minigame with server-checked scores
- [ ] Phase 8: XP, ranks, leaderboards, furniture shop
- [ ] Phase 9: moderation (filter, report, block), security review, public deploy

## Credits

- Art: [Tiny Town](https://kenney.nl/assets/tiny-town) and [Roguelike Indoors](https://kenney.nl/assets/roguelike-indoors) by **Kenney** (CC0). See `client/public/assets/LICENSES.md`.
- Music: streamed from the original YouTube channels (Lofi Girl, Chillhop Music) through YouTube's official embedded player.
