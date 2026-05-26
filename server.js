const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '3333', 10);
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';
const DEMO_MODE = (process.env.DEMO_MODE || 'true').toLowerCase() === 'true';

const DIST_DIR = path.join(__dirname, 'dist');
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.warn('[weyell] dist/ not found — run `npm run build` first.');
}

const app = express();
app.use(express.static(DIST_DIR));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const agents = new Map();
let discordStatus = DEMO_MODE ? 'demo' : 'disconnected';
let lastMessageId = null;

const AGENT_COLORS = ['#7cf3d3', '#ffd166', '#a48cf0', '#ff8fa3', '#7bd3f7'];

// ── agent state management ──

function upsertAgent(id, name, role, color, state, activity, tool, desk) {
  let a = agents.get(id);
  if (!a) {
    a = {
      id, name: name || id, role: role || 'Agent',
      color: color || AGENT_COLORS[agents.size % AGENT_COLORS.length],
      desk: desk || { dx: agents.size % 3, dy: Math.floor(agents.size / 3) },
      state: 'IDLE', activity: '', tool: null,
      lastEvent: Date.now(), activityLog: []
    };
    agents.set(id, a);
  }
  if (state) a.state = state;
  if (activity !== undefined) a.activity = activity;
  if (tool !== undefined) a.tool = tool;
  a.lastEvent = Date.now();
  if (state || activity) {
    a.activityLog.unshift({ ts: Date.now(), text: `${a.state}${a.tool ? ` (${a.tool})` : ''}: ${a.activity}` });
    if (a.activityLog.length > 12) a.activityLog.pop();
  }
  return a;
}

function snapshot() {
  return {
    type: 'snapshot',
    discordStatus,
    demoMode: DEMO_MODE,
    agents: Array.from(agents.values())
  };
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); });
}

// ── Discord embed parser ──
// Expects embeds with:
//   title = agent name, description = activity text
//   color = hex state color, footer = tool name
//   fields: [{ name: "role", value: "..." }, { name: "state", value: "..." }]

const STATE_COLORS = {
  0x5ddf9a: 'WORKING', 0xffd166: 'THINKING',
  0x6bb6ff: 'WAITING', 0xff6b6b: 'ERROR',
  0x8b93a7: 'IDLE'
};

function parseEmbeds(messages, sinceId) {
  const newMessages = [];
  for (const msg of messages) {
    if (sinceId && msg.id <= sinceId) continue;
    if (!msg.embeds || !msg.embeds.length) continue;
    newMessages.push(msg);
    for (const embed of msg.embeds) {
      const id = embed.author?.name || embed.footer?.text || msg.author?.username || msg.id;
      const name = embed.title || id;
      let role = 'Agent', state = null, activity = embed.description || '';
      const tool = embed.footer?.text || null;
      const color = embed.color;

      for (const f of (embed.fields || [])) {
        if (f.name === 'role') role = f.value;
        if (f.name === 'state') state = f.value.toUpperCase();
      }

      if (!state && color && STATE_COLORS[color]) state = STATE_COLORS[color];
      if (!state) state = activity ? 'WORKING' : 'IDLE';

      upsertAgent(id, name, role, embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : null, state, activity, tool);
    }
  }
  return newMessages;
}

// ── Discord REST API polling ──

async function pollDiscord() {
  if (DEMO_MODE || !DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) return;
  try {
    const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=10`;
    const res = await fetch(url, { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } });
    if (!res.ok) {
      if (res.status === 401) { discordStatus = 'unauthorized'; console.warn('[weyell] Discord bot token invalid'); }
      else if (res.status === 404) { discordStatus = 'no-channel'; console.warn('[weyell] Discord channel not found'); }
      else { discordStatus = 'error'; }
      broadcast({ type: 'status', discordStatus });
      return;
    }
    discordStatus = 'connected';
    const messages = await res.json();
    const newest = parseEmbeds(messages, lastMessageId);
    if (newest.length) lastMessageId = newest[0].id;
    broadcast({ type: 'status', discordStatus });
    broadcast({ type: 'agents', agents: Array.from(agents.values()) });
  } catch (err) {
    discordStatus = 'disconnected';
    broadcast({ type: 'status', discordStatus });
  }
}

// ── demo mode ──

const MOCK_TASKS = [
  'Refactoring auth middleware', 'Running pytest suite',
  'Drafting PR description', 'Reading gateway source',
  'Patching config', 'Reviewing diff for issue #142',
  'Indexing repo symbols', 'Calling Read tool',
  'Calling Edit tool', 'Calling Bash tool',
  'Waiting on user approval'
];
const MOCK_TOOLS = ['Read', 'Edit', 'Write', 'Grep', 'Bash', 'WebFetch', 'TaskCreate'];
const STATES = ['IDLE', 'WORKING', 'THINKING', 'WAITING', 'ERROR'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const DEMO_AGENTS = [
  { id: 'hermes-1', name: 'Hermes', role: 'Orchestrator', color: '#7cf3d3' },
  { id: 'apollo-1', name: 'Apollo', role: 'Code Writer', color: '#ffd166' },
  { id: 'athena-1', name: 'Athena', role: 'Researcher', color: '#a48cf0' },
  { id: 'iris-1',   name: 'Iris',   role: 'Reviewer',   color: '#ff8fa3' },
  { id: 'argos-1',  name: 'Argos',  role: 'Test Runner', color: '#7bd3f7' }
];

function seedDemo() {
  DEMO_AGENTS.forEach((tpl, i) => {
    upsertAgent(tpl.id, tpl.name, tpl.role, tpl.color,
      'IDLE', 'Waiting for work', null,
      { dx: i % 3, dy: Math.floor(i / 3) });
  });
}

function tickDemo() {
  const list = Array.from(agents.values());
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const a = pick(list);
    const roll = Math.random();
    let state, activity, tool;
    if (roll < 0.45) { state = 'WORKING'; activity = pick(MOCK_TASKS); tool = pick(MOCK_TOOLS); }
    else if (roll < 0.7) { state = 'THINKING'; activity = 'Planning next step'; tool = null; }
    else if (roll < 0.85) { state = 'WAITING'; activity = 'Waiting for tool result'; tool = a.tool; }
    else if (roll < 0.95) { state = 'IDLE'; activity = 'Idle'; tool = null; }
    else { state = 'ERROR'; activity = 'Tool call failed — retrying'; tool = a.tool; }
    upsertAgent(a.id, a.name, a.role, a.color, state, activity, tool, a.desk);
  }
  broadcast({ type: 'agents', agents: Array.from(agents.values()) });
}

// ── HTTP API ──

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, discordStatus, demoMode: DEMO_MODE, agents: agents.size });
});

// ── WebSocket ──

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(snapshot()));
  ws.on('error', () => {});
});

// ── start ──

if (DEMO_MODE || !DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
  if (DEMO_MODE) console.log('[weyell] DEMO mode — mock agent activity');
  else console.log('[weyell] DEMO mode (no Discord bot token/channel configured) — mock agent activity');
  discordStatus = 'demo';
  seedDemo();
  setInterval(tickDemo, 2000 + Math.random() * 3000);
} else {
  console.log(`[weyell] Live mode — polling Discord channel ${DISCORD_CHANNEL_ID}`);
  seedDemo(); // initial seed, then overwritten by Discord data
  pollDiscord();
  setInterval(pollDiscord, 3000);
}

server.listen(PORT, () => {
  console.log(`[weyell] http://localhost:${PORT}`);
});
