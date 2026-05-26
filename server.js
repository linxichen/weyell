const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '3333', 10);
const HERMES_GATEWAY_URL = process.env.HERMES_GATEWAY_URL || 'ws://localhost:18789/';
const DEMO_MODE = (process.env.DEMO_MODE || 'true').toLowerCase() === 'true';

const DIST_DIR = path.join(__dirname, 'dist');
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.warn('[weyell] dist/ not found — run `npm run build` to bundle the frontend.');
}

const app = express();
app.use(express.static(DIST_DIR));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const STATES = ['IDLE', 'WORKING', 'THINKING', 'WAITING', 'ERROR'];

const AGENT_TEMPLATES = [
  { id: 'hermes-1', name: 'Hermes',   role: 'Orchestrator',    color: '#7cf3d3' },
  { id: 'apollo-1', name: 'Apollo',   role: 'Code Writer',     color: '#ffd166' },
  { id: 'athena-1', name: 'Athena',   role: 'Researcher',      color: '#a48cf0' },
  { id: 'iris-1',   name: 'Iris',     role: 'Reviewer',        color: '#ff8fa3' },
  { id: 'argos-1',  name: 'Argos',    role: 'Test Runner',     color: '#7bd3f7' }
];

const MOCK_TASKS = [
  'Refactoring auth middleware',
  'Searching docs for "rate limit"',
  'Running pytest suite',
  'Drafting PR description',
  'Reading hermes/gateway.ts',
  'Patching server.js',
  'Reviewing diff for issue #142',
  'Indexing repo symbols',
  'Calling Read tool',
  'Calling Edit tool',
  'Calling Bash tool',
  'Waiting on user approval'
];

const MOCK_TOOLS = ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash', 'WebFetch', 'TaskCreate'];

const agents = new Map();
let gatewayStatus = DEMO_MODE ? 'demo' : 'connecting';
let gatewaySocket = null;

function seedAgents() {
  const deskGrid = [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 1, dy: 1 }
  ];
  AGENT_TEMPLATES.forEach((tpl, idx) => {
    const slot = deskGrid[idx % deskGrid.length];
    agents.set(tpl.id, {
      ...tpl,
      desk: slot,
      state: 'IDLE',
      activity: 'Waiting for work',
      tool: null,
      lastEvent: Date.now(),
      activityLog: []
    });
  });
}

function snapshot() {
  return {
    type: 'snapshot',
    gatewayStatus,
    demoMode: DEMO_MODE,
    agents: Array.from(agents.values())
  };
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

function logActivity(agent, text) {
  const entry = { ts: Date.now(), text };
  agent.activityLog.unshift(entry);
  if (agent.activityLog.length > 12) agent.activityLog.pop();
}

function setAgentState(agent, state, opts = {}) {
  agent.state = state;
  if (opts.activity) agent.activity = opts.activity;
  if (opts.tool !== undefined) agent.tool = opts.tool;
  agent.lastEvent = Date.now();
  logActivity(agent, `${state}${opts.tool ? ` (${opts.tool})` : ''}: ${agent.activity}`);
  broadcast({ type: 'agent', agent });
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function tickDemo() {
  if (!DEMO_MODE) return;
  const list = Array.from(agents.values());
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const a = pick(list);
    const roll = Math.random();
    if (roll < 0.45) {
      setAgentState(a, 'WORKING', { activity: pick(MOCK_TASKS), tool: pick(MOCK_TOOLS) });
    } else if (roll < 0.7) {
      setAgentState(a, 'THINKING', { activity: 'Planning next step', tool: null });
    } else if (roll < 0.85) {
      setAgentState(a, 'WAITING', { activity: 'Waiting for tool result', tool: a.tool });
    } else if (roll < 0.95) {
      setAgentState(a, 'IDLE', { activity: 'Idle', tool: null });
    } else {
      setAgentState(a, 'ERROR', { activity: 'Tool call failed — retrying', tool: a.tool });
    }
  }
}

function startDemoLoop() {
  function loop() {
    tickDemo();
    const delay = 1500 + Math.random() * 3500;
    setTimeout(loop, delay);
  }
  setTimeout(loop, 1000);
}

function handleHermesEvent(raw) {
  let evt;
  try { evt = JSON.parse(raw); } catch { return; }
  if (!evt || typeof evt !== 'object') return;
  const id = evt.agent_id || evt.agentId || evt.session_id || evt.id;
  if (!id) return;
  let agent = agents.get(id);
  if (!agent) {
    const tpl = AGENT_TEMPLATES[agents.size % AGENT_TEMPLATES.length];
    agent = {
      id,
      name: evt.name || id.slice(0, 8),
      role: evt.role || 'Agent',
      color: tpl.color,
      desk: { dx: agents.size % 3, dy: Math.floor(agents.size / 3) },
      state: 'IDLE',
      activity: 'Connecting',
      tool: null,
      lastEvent: Date.now(),
      activityLog: []
    };
    agents.set(id, agent);
  }
  const type = (evt.type || evt.event || '').toLowerCase();
  if (type.includes('tool')) {
    setAgentState(agent, 'WORKING', { activity: evt.activity || `Tool: ${evt.tool || 'unknown'}`, tool: evt.tool || null });
  } else if (type.includes('think') || type.includes('plan')) {
    setAgentState(agent, 'THINKING', { activity: evt.activity || 'Thinking', tool: null });
  } else if (type.includes('wait')) {
    setAgentState(agent, 'WAITING', { activity: evt.activity || 'Waiting', tool: agent.tool });
  } else if (type.includes('error') || type.includes('fail')) {
    setAgentState(agent, 'ERROR', { activity: evt.activity || 'Error', tool: agent.tool });
  } else if (type.includes('idle') || type.includes('done') || type.includes('complete')) {
    setAgentState(agent, 'IDLE', { activity: evt.activity || 'Idle', tool: null });
  } else if (evt.activity) {
    setAgentState(agent, agent.state, { activity: evt.activity });
  }
}

function connectHermes() {
  if (DEMO_MODE) return;
  try {
    gatewayStatus = 'connecting';
    broadcast({ type: 'status', gatewayStatus });
    gatewaySocket = new WebSocket(HERMES_GATEWAY_URL);
    gatewaySocket.on('open', () => {
      gatewayStatus = 'connected';
      broadcast({ type: 'status', gatewayStatus });
      console.log(`[weyell] connected to Hermes gateway at ${HERMES_GATEWAY_URL}`);
    });
    gatewaySocket.on('message', (data) => handleHermesEvent(data.toString()));
    gatewaySocket.on('close', () => {
      gatewayStatus = 'disconnected';
      broadcast({ type: 'status', gatewayStatus });
      console.log('[weyell] hermes gateway disconnected — retrying in 5s');
      setTimeout(connectHermes, 5000);
    });
    gatewaySocket.on('error', (err) => {
      console.warn('[weyell] hermes gateway error:', err.message);
    });
  } catch (err) {
    gatewayStatus = 'disconnected';
    console.warn('[weyell] gateway connect failed:', err.message);
    setTimeout(connectHermes, 5000);
  }
}

app.get('/api/agents', (_req, res) => {
  res.json({
    gatewayStatus,
    demoMode: DEMO_MODE,
    agents: Array.from(agents.values())
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, gatewayStatus, demoMode: DEMO_MODE, agents: agents.size });
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(snapshot()));
  ws.on('error', () => {});
});

seedAgents();
if (DEMO_MODE) {
  console.log('[weyell] DEMO_MODE enabled — generating mock agent activity');
  startDemoLoop();
} else {
  console.log(`[weyell] live mode — connecting to ${HERMES_GATEWAY_URL}`);
  connectHermes();
}

server.listen(PORT, () => {
  console.log(`[weyell] http://localhost:${PORT}`);
});
