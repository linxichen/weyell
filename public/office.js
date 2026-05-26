// Office renderer + WebSocket client.
// Draws the scene in pixel-art space then scales up to the canvas.

(function () {
  const canvas = document.getElementById('office');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const SCALE = 4;                  // pixel art scale factor
  const ROOM_W = canvas.width / SCALE;   // 240
  const ROOM_H = canvas.height / SCALE;  // 160

  // Desk grid layout (in pixel-art coords)
  const DESK_GRID = [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 }
  ];
  const DESK_ORIGIN = { x: 40, y: 56 };
  const DESK_SPACING = { x: 64, y: 56 };

  function deskCoords(slot) {
    return {
      x: DESK_ORIGIN.x + slot.dx * DESK_SPACING.x,
      y: DESK_ORIGIN.y + slot.dy * DESK_SPACING.y
    };
  }

  const sprites = new Map();       // id -> AgentSprite
  let selectedId = null;
  let gatewayStatus = 'connecting';
  const streamLog = [];

  // ---------- Canvas / DPR sizing ----------
  function resize() {
    const stage = document.getElementById('stage');
    const rect = stage.getBoundingClientRect();
    const legendH = document.getElementById('legend').getBoundingClientRect().height;
    const topH = document.getElementById('topbar').getBoundingClientRect().height;
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(240, Math.floor(rect.height - legendH - topH));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    // Keep internal resolution snapped to pixel-art space
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Background ----------
  function drawRoom(now, viewW, viewH) {
    // Floor tiles
    const tileSize = 16;
    for (let y = 0; y < viewH; y += tileSize) {
      for (let x = 0; x < viewW; x += tileSize) {
        const dark = ((x / tileSize) + (y / tileSize)) % 2 === 0;
        ctx.fillStyle = dark ? '#161a24' : '#1c2230';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
    // Walls
    ctx.fillStyle = '#0a0c11';
    ctx.fillRect(0, 0, viewW, 16);
    ctx.fillRect(0, 0, 4, viewH);
    ctx.fillRect(viewW - 4, 0, 4, viewH);
    ctx.fillRect(0, viewH - 4, viewW, 4);
    // Wall trim
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(0, 16, viewW, 1);

    // Windows on top wall
    for (let i = 0; i < 3; i++) {
      const wx = 30 + i * 70;
      ctx.fillStyle = '#1c2230';
      ctx.fillRect(wx, 4, 22, 9);
      ctx.fillStyle = '#3a4156';
      ctx.fillRect(wx, 4, 22, 1);
      ctx.fillRect(wx, 12, 22, 1);
      ctx.fillRect(wx + 10, 4, 1, 9);
      // sky glow
      ctx.fillStyle = `rgba(124,243,211,${0.15 + 0.05 * Math.sin(now * 0.001 + i)})`;
      ctx.fillRect(wx + 1, 5, 9, 7);
      ctx.fillRect(wx + 12, 5, 9, 7);
    }

    // Decorative plant in corner
    drawPlant(viewW - 22, viewH - 28);
    drawPlant(10, viewH - 28);
    // Server rack
    drawServerRack(viewW - 30, 22, now);
  }

  function drawPlant(x, y) {
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(x, y + 10, 10, 6);
    ctx.fillStyle = '#2a4a2a';
    ctx.fillRect(x + 2, y + 4, 6, 7);
    ctx.fillStyle = '#3a6a3a';
    ctx.fillRect(x + 1, y + 2, 3, 4);
    ctx.fillRect(x + 6, y + 2, 3, 4);
    ctx.fillStyle = '#4a8a4a';
    ctx.fillRect(x + 3, y, 4, 3);
  }

  function drawServerRack(x, y, now) {
    ctx.fillStyle = '#1a1d26';
    ctx.fillRect(x, y, 18, 26);
    ctx.fillStyle = '#0a0c11';
    ctx.fillRect(x + 2, y + 2, 14, 22);
    for (let i = 0; i < 4; i++) {
      const ry = y + 3 + i * 5;
      ctx.fillStyle = '#2a3142';
      ctx.fillRect(x + 3, ry, 12, 3);
      const blink = Math.floor(now * 0.005 + i) % 3;
      ctx.fillStyle = blink === 0 ? '#5ddf9a' : '#2a3142';
      ctx.fillRect(x + 12, ry + 1, 1, 1);
      ctx.fillStyle = blink === 1 ? '#ffd166' : '#2a3142';
      ctx.fillRect(x + 13, ry + 1, 1, 1);
    }
  }

  // ---------- Desk ----------
  function drawDesk(d, agentColor, name) {
    const x = d.x;
    const y = d.y;
    // chair behind desk
    ctx.fillStyle = '#3a3142';
    ctx.fillRect(x + 6, y + 12, 8, 2);
    ctx.fillRect(x + 8, y + 14, 4, 4);

    // desk top
    ctx.fillStyle = '#5a3e2a';
    ctx.fillRect(x, y - 4, 20, 8);
    ctx.fillStyle = '#3e2818';
    ctx.fillRect(x, y + 3, 20, 1);
    // legs
    ctx.fillStyle = '#3e2818';
    ctx.fillRect(x + 1, y + 4, 2, 6);
    ctx.fillRect(x + 17, y + 4, 2, 6);
    // monitor
    ctx.fillStyle = '#1a1d26';
    ctx.fillRect(x + 5, y - 12, 10, 8);
    ctx.fillStyle = '#0a0c11';
    ctx.fillRect(x + 6, y - 11, 8, 6);
    // monitor screen content (state-tinted)
    ctx.fillStyle = agentColor;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x + 6, y - 11, 8, 6);
    ctx.globalAlpha = 1;
    // monitor lines (mock code)
    ctx.fillStyle = '#7cf3d3';
    ctx.fillRect(x + 7, y - 10, 3, 1);
    ctx.fillRect(x + 7, y - 8, 5, 1);
    ctx.fillRect(x + 7, y - 6, 2, 1);
    // monitor stand
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(x + 9, y - 4, 2, 2);
    // keyboard
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(x + 4, y - 1, 12, 2);

    // nameplate strip on desk front
    ctx.fillStyle = '#1a1d26';
    ctx.fillRect(x + 2, y + 4, 16, 4);
    // name text (drawn later in screen space for crispness)
  }

  // ---------- Main loop ----------
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - lastT);
    lastT = now;
    const dpr = window.devicePixelRatio || 1;
    const viewW = Math.floor(canvas.width / (SCALE * dpr));
    const viewH = Math.floor(canvas.height / (SCALE * dpr));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(SCALE * dpr, SCALE * dpr);

    drawRoom(now, viewW, viewH);

    // Desks underneath all agents
    for (const sprite of sprites.values()) {
      drawDesk(sprite.desk, window.STATE_COLORS[sprite.state] || '#7cf3d3', sprite.name);
    }

    // Agents
    const list = Array.from(sprites.values()).sort((a, b) => a.y - b.y);
    for (const s of list) {
      s.update(dt, now);
      if (selectedId === s.id) {
        // selection ring
        ctx.fillStyle = '#7cf3d3';
        const px = Math.round(s.x), py = Math.round(s.y);
        const ph = Math.floor(now * 0.008) % 2;
        for (let i = -6; i <= 6; i++) {
          if ((i + ph) % 2 === 0) {
            ctx.fillRect(px + i, py + 11, 1, 1);
            ctx.fillRect(px + i, py - 6, 1, 1);
          }
        }
        for (let j = -6; j <= 11; j++) {
          if ((j + ph) % 2 === 0) {
            ctx.fillRect(px - 6, py + j, 1, 1);
            ctx.fillRect(px + 6, py + j, 1, 1);
          }
        }
      }
      s.draw(ctx, now);
    }

    // Screen-space overlays (nameplates + bubbles) — reset transform for crisp text
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const font = '10px "JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace';
    ctx.font = font;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';

    // Nameplates on desks
    for (const s of sprites.values()) {
      const dx = (s.desk.x + 10) * SCALE;
      const dy = (s.desk.y + 4) * SCALE;
      ctx.fillStyle = '#e6e8ee';
      ctx.fillText(s.name.toUpperCase(), dx, dy + 1);
    }
    ctx.textAlign = 'left';
    // Speech bubbles
    for (const s of list) {
      s.drawBubble(ctx, SCALE, font);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Hit testing ----------
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * (canvas.width / (window.devicePixelRatio || 1)) / SCALE;
    const py = (e.clientY - rect.top) / rect.height * (canvas.height / (window.devicePixelRatio || 1)) / SCALE;
    let hit = null;
    for (const s of sprites.values()) {
      if (Math.abs(s.x - px) < 6 && py > s.y - 5 && py < s.y + 11) {
        hit = s; break;
      }
    }
    selectAgent(hit ? hit.id : null);
  });

  // ---------- UI helpers ----------
  function setStatus(s) {
    gatewayStatus = s;
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = 'dot ' + s;
    const labels = {
      connected: 'live · hermes gateway',
      demo: 'demo mode',
      disconnected: 'disconnected',
      connecting: 'connecting…'
    };
    text.textContent = labels[s] || s;
  }

  function fmtTs(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour12: false });
  }

  function renderAgentList() {
    const ul = document.getElementById('agent-list');
    ul.innerHTML = '';
    for (const s of sprites.values()) {
      const li = document.createElement('li');
      li.dataset.id = s.id;
      if (s.id === selectedId) li.classList.add('selected');
      li.innerHTML = `
        <span class="pip" style="background:${s.color}"></span>
        <span>
          <div class="name">${s.name}</div>
          <div class="role">${s.role}</div>
        </span>
        <span class="state ${s.state}">${s.state}</span>
      `;
      li.addEventListener('click', () => selectAgent(s.id));
      ul.appendChild(li);
    }
  }

  function renderDetail() {
    const empty = document.getElementById('detail-empty');
    const wrap = document.getElementById('detail');
    if (!selectedId || !sprites.has(selectedId)) {
      empty.hidden = false; wrap.hidden = true; return;
    }
    empty.hidden = true; wrap.hidden = false;
    const s = sprites.get(selectedId);
    document.getElementById('d-name').textContent = s.name;
    document.getElementById('d-role').textContent = s.role;
    const stateEl = document.getElementById('d-state');
    stateEl.textContent = s.state;
    stateEl.className = 'badge ' + s.state;
    document.getElementById('d-tool').textContent = s.tool || '—';
    document.getElementById('d-activity').textContent = s.activity || '—';
    const log = document.getElementById('d-log');
    log.innerHTML = '';
    (s.activityLog || []).forEach((entry) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="ts">${fmtTs(entry.ts)}</span>${escapeHtml(entry.text)}`;
      log.appendChild(li);
    });
  }

  function renderStream() {
    const ul = document.getElementById('stream');
    ul.innerHTML = '';
    streamLog.slice(0, 40).forEach((e) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="ts">${fmtTs(e.ts)}</span><span class="who" style="color:${e.color}">${e.name}</span>${escapeHtml(e.text)}`;
      ul.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function selectAgent(id) {
    selectedId = id;
    renderAgentList();
    renderDetail();
  }

  // ---------- Agent state ingestion ----------
  function upsertAgent(data) {
    let s = sprites.get(data.id);
    if (!s) {
      // assign desk by current sprite count, or use provided desk
      const slotIdx = sprites.size % DESK_GRID.length;
      const slot = data.desk
        ? { dx: data.desk.dx, dy: data.desk.dy }
        : DESK_GRID[slotIdx];
      const desk = deskCoords(slot);
      s = new AgentSprite(data, desk);
      sprites.set(data.id, s);
    } else {
      s.color = data.color || s.color;
      s.name = data.name || s.name;
      s.role = data.role || s.role;
    }
    const prevState = s.state;
    s.setState(data.state, data.activity, data.tool);
    s.activityLog = data.activityLog || s.activityLog || [];

    if (prevState !== data.state || data.activity) {
      streamLog.unshift({
        ts: Date.now(),
        name: s.name,
        color: s.color,
        text: ` ${data.state}${data.tool ? ` · ${data.tool}` : ''} — ${data.activity || ''}`
      });
      if (streamLog.length > 60) streamLog.pop();
    }
  }

  // ---------- WebSocket ----------
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/`);
    ws.onopen = () => { /* status arrives in snapshot */ };
    ws.onclose = () => {
      setStatus('disconnected');
      setTimeout(connect, 2000);
    };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'snapshot') {
        setStatus(msg.demoMode ? 'demo' : msg.gatewayStatus);
        msg.agents.forEach(upsertAgent);
        renderAgentList();
        renderDetail();
        renderStream();
      } else if (msg.type === 'status') {
        setStatus(msg.gatewayStatus);
      } else if (msg.type === 'agent') {
        upsertAgent(msg.agent);
        renderAgentList();
        renderDetail();
        renderStream();
      }
    };
  }

  setStatus('connecting');
  connect();
})();
