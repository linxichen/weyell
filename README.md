# WeYell — pixel agent office (Discord Activity)

A pixel-art office that visualizes Hermes AI agents in real-time, packaged
as a **Discord Activity** via the [Embedded App SDK](https://github.com/discord/embedded-app-sdk).

**Architecture:** Hermes posts structured embeds to a Discord channel → WeYell
server reads them via Discord REST API → frontend renders animated
pixel agents in a virtual office inside Discord.

```
Hermes agent tool calls
        │
        ▼
┌──────────────────┐     REST API polling      ┌──────────────┐
│  Discord channel │ ◄───────────────────────── │ WeYell server│
│  #weyell-office  │                            │  :3333       │
│  (embeds posted  │     WebSocket fanout       │              │
│   by Hermes)     │ ──────────────────────────►│  serves Vite │
└──────────────────┘                            │  dist/       │
                                                 └──────┬───────┘
                                                        │ Discord SDK
                                                        ▼
                                                 ┌──────────────┐
                                                 │ WeYell       │
                                                 │ Activity     │
                                                 │ (iframe in   │
                                                 │  Discord)    │
                                                 └──────────────┘
```

## Quick start

### 1. Create a Discord application

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** (name it "WeYell").
2. From **General Information**, copy the **Application ID** → this is `VITE_DISCORD_CLIENT_ID`.
3. Go to **Bot** → **Reset Token** → copy the bot token → this is `DISCORD_BOT_TOKEN`.
4. Under **Bot → Privileged Gateway Intents**, enable **Message Content Intent**.
5. Under **Activities → Settings**, toggle the activity on.
6. Under **Activities → URL Mappings**, add root mapping: prefix `/` → target `https://your-domain.com` (or ngrok URL).
7. Under **Installation → Default Install Settings**, select `applications.commands` scope.
8. Invite the bot to your server:
   `https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=274877925376&scope=bot%20applications.commands`

### 2. Create the office channel

Create a Discord channel (e.g. `#weyell-office`), right-click → **Copy Channel ID** (enable Developer Mode in Discord settings first). This is `DISCORD_CHANNEL_ID`.

### 3. Configure env

```bash
cp .env.example .env
# Edit .env: paste VITE_DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID
```

### 4. Run

```bash
docker compose up --build
```

…or without Docker:

```bash
npm install
npm run build
DEMO_MODE=false DISCORD_BOT_TOKEN=... DISCORD_CHANNEL_ID=... node server.js
```

### 5. Launch the Activity in Discord

1. Join a voice channel in your server.
2. Click the rocket icon (Activities) at the bottom of the voice panel.
3. Select "WeYell" from the list.
4. The iframe loads — topbar shows channel name, green SDK dot, and "live · discord feed".

### 6. Post agent data

For testing, use the mock script:

```bash
./scripts/post-mock-embeds.sh $DISCORD_BOT_TOKEN $DISCORD_CHANNEL_ID
```

For production, Hermes uses the `weyell-agent-feed` skill to post real agent states. Each Discord embed maps to one agent:

```json
{
  "embeds": [{
    "title": "Hermes",
    "description": "Dispatching kanban tasks",
    "color": 6135258,
    "footer": { "text": "kanban_create" },
    "fields": [
      { "name": "role", "value": "Orchestrator" },
      { "name": "state", "value": "WORKING" }
    ]
  }]
}
```

## Standalone (non-Discord) preview

Open `http://localhost:3333` in a browser. The Discord SDK gracefully
degrades — the topbar shows `# (standalone)` and demo mode runs 5 mock
agents cycling through states.

## Configuration

| Var                       | Where       | Default          | Notes                                    |
|---------------------------|-------------|------------------|------------------------------------------|
| `VITE_DISCORD_CLIENT_ID`  | build-time  | _(empty)_         | Discord Application ID                   |
| `DISCORD_BOT_TOKEN`       | runtime     | _(empty)_         | Bot token to read channel messages       |
| `DISCORD_CHANNEL_ID`      | runtime     | _(empty)_         | Channel ID where Hermes posts embeds     |
| `PORT`                    | runtime     | `3333`            | HTTP + WebSocket port                    |
| `DEMO_MODE`               | runtime     | `true`            | `false` to use live Discord feed         |

## File map

```
weyell/
├── Dockerfile
├── docker-compose.yml
├── vite.config.mjs
├── package.json
├── server.js                # polls Discord REST API, fans out via WebSocket
├── .env.example
├── scripts/
│   └── post-mock-embeds.sh  # posts test embeds to Discord channel
└── public/                  # vite root
    ├── index.html
    ├── style.css
    ├── main.js
    ├── discord-sdk.js       # Embedded App SDK bootstrap
    ├── agent.js             # pixel-art agent sprites
    └── office.js            # canvas renderer + WebSocket client
```
