# WeYell — pixel agent office (Discord Activity)

A pixel-art office that visualizes Hermes AI agents in real-time, packaged
as a **Discord Activity** — an iframe app embedded inside a Discord voice
channel via the [Embedded App SDK](https://github.com/discord/embedded-app-sdk).
Each desk holds one agent; speech bubbles show the current tool call and
activity; state is color-coded (idle, working, thinking, waiting, error).

```
┌──────────────────────────────────┬─────────────┐
│ ▣ WeYell  #voice-1   ● sdk ● gw  │   AGENTS    │
│ ┌──────────────────────────────┐ │   Hermes ●  │
│ │  [windows] [windows] [rack]  │ │   Apollo ●  │
│ │   ░▒ floor tiles ▒░          │ │   Athena ●  │
│ │   🖳 🖳 🖳   <- desks       │ │   ...       │
│ │   👤 👤 👤   <- agents      │ │   DETAIL    │
│ │   🖳 🖳                     │ │   STREAM    │
│ └──────────────────────────────┘ │             │
└──────────────────────────────────┴─────────────┘
```

## Quick start

### 1. Create a Discord application

1. Open <https://discord.com/developers/applications> and click **New
   Application**. Give it a name (e.g. "WeYell").
2. From **General Information**, copy the **Application ID** — this is
   your `VITE_DISCORD_CLIENT_ID`.
3. Open **Activities → Settings** (in the left sidebar). Toggle the
   activity on.
4. Under **Activities → URL Mappings**, add a root mapping:
   - `PREFIX`: `/`
   - `TARGET`: the public hostname where WeYell is reachable (e.g.
     `weyell.example.com`, or a Cloudflare Tunnel / ngrok URL pointing at
     `localhost:3333`).
5. Under **OAuth2 → Redirects**, add `https://<your-app-id>.discordsays.com/`.
6. Under **Installation → Default Install Settings**, make sure the
   `applications.commands` scope is selected so the activity can be
   launched in servers.

### 2. Configure env

```
cp .env.example .env
# edit .env, paste the Application ID into VITE_DISCORD_CLIENT_ID
```

### 3. Run

```
docker compose up --build
```

…or without Docker:

```
npm install
npm run build      # bundles the frontend (needs VITE_DISCORD_CLIENT_ID at build time)
npm start          # serves dist/ on http://localhost:3333
```

### 4. Launch the activity in Discord

1. In any Discord server you own, join a **voice channel**.
2. Click the **rocket icon** (Activities) at the bottom of the voice
   panel.
3. Pick your app from the list ("WeYell" — appears under "From this
   server" once the app is added).
4. The iframe loads, the SDK handshake runs, and the topbar shows the
   current channel name plus a green **sdk ready** dot.

> Don't see the app in the list? Make sure the activity is **enabled**
> in the Developer Portal and that the URL Mapping target is reachable
> over HTTPS. Discord requires HTTPS for activities — use
> [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
> or [ngrok](https://ngrok.com/) when developing locally.

## Standalone (non-Discord) preview

You can still open <http://localhost:3333> in a regular browser. The
Discord SDK gracefully bails when it doesn't see Discord's
`frame_id` query param — the topbar shows `# (standalone)` and the rest
of the app (Canvas office, agent rendering, demo loop, gateway) keeps
working exactly as before.

For frontend-only hot reload while developing, run Vite directly:

```
npm run dev        # vite on :3334, proxies /api + /ws to :3333
```

## Live mode (Hermes gateway)

Set `DEMO_MODE=false` and point `HERMES_GATEWAY_URL` at a running
gateway:

```
DEMO_MODE=false HERMES_GATEWAY_URL=ws://localhost:18789/ npm start
```

The server connects to the gateway WebSocket, treats each inbound JSON
event as an agent update, and maps known `type` fragments (`tool`,
`think`, `wait`, `error`, `idle`/`done`) onto agent states. Unknown
events update the `activity` field without changing state.

## Configuration

| Var                        | Where used        | Default                          | Notes                                  |
|----------------------------|-------------------|----------------------------------|----------------------------------------|
| `VITE_DISCORD_CLIENT_ID`   | **build-time**    | _(empty)_                        | Discord Application ID                 |
| `PORT`                     | server runtime    | `3333`                           | HTTP + WebSocket port                  |
| `DEMO_MODE`                | server runtime    | `true`                           | `false` to use the live gateway        |
| `HERMES_GATEWAY_URL`       | server runtime    | `ws://localhost:18789/`          | Hermes WebSocket endpoint              |

`VITE_DISCORD_CLIENT_ID` is **inlined at build time** by Vite — change it
and you must re-run `npm run build` (or `docker compose build`).

## API

- `GET /api/agents` — current agent snapshot
- `GET /api/health` — liveness + counts
- `WS /` — live updates (`snapshot`, `agent`, `status` message types)

## How it works

- **Discord Activity shell.** `public/discord-sdk.js` instantiates
  `DiscordSDK(clientId)`, awaits `ready()`, calls
  `commands.getChannel(...)`, and writes the channel name + SDK status
  into the topbar. When the page isn't loaded inside Discord (no
  `frame_id` query param) it skips initialization and lets the app run
  standalone.
- **Frontend.** Plain HTML5 Canvas 2D, no UI framework. Bundled by
  **Vite** (`npm run build` → `dist/`). The office is drawn in a tiny
  pixel-art coordinate space and scaled up `4x` with
  `image-rendering: pixelated`. Characters are drawn from primitive
  rectangles — no image assets.
- **Backend.** Single-file Node.js with `express` for static + JSON and
  `ws` for the WebSocket fanout. Agent state lives in memory. Static
  serving points at the Vite-built `dist/`.
- **Demo loop.** Every 1.5–5s, picks a random agent and rolls a state
  transition. Activities and tools are picked from short word lists.

## File map

```
weyell/
├── Dockerfile               # multi-stage: vite build → node serve
├── docker-compose.yml
├── vite.config.js
├── package.json
├── server.js                # serves dist/, fans out gateway events
├── .env.example
└── public/                  # vite root
    ├── index.html
    ├── style.css
    ├── main.js              # module entry — imports the three below
    ├── discord-sdk.js       # Embedded App SDK bootstrap
    ├── agent.js             # pixel-art agent sprites
    └── office.js            # canvas renderer + websocket client
```
