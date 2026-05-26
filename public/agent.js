// Pixel-art agent rendering and state machine.
// Coordinates are in "pixel-art space" — the canvas is drawn at SCALE = 4.

const STATE_COLORS = {
  IDLE:     '#8b93a7',
  WORKING:  '#5ddf9a',
  THINKING: '#ffd166',
  WAITING:  '#6bb6ff',
  ERROR:    '#ff6b6b'
};

class AgentSprite {
  constructor(data, desk) {
    this.id = data.id;
    this.name = data.name;
    this.role = data.role;
    this.color = data.color || '#7cf3d3';
    this.desk = desk;          // { x, y } pixel-art coords (top-left of desk)
    this.x = desk.x + 8;       // current position
    this.y = desk.y + 14;
    this.tx = this.x;          // target position
    this.ty = this.y;
    this.state = data.state || 'IDLE';
    this.activity = data.activity || '';
    this.tool = data.tool || null;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.toolPhase = Math.random() * Math.PI * 2;
    this.bubbleAlpha = 0;
    this.lastChange = performance.now();
  }

  setState(state, activity, tool) {
    if (this.state !== state) this.lastChange = performance.now();
    this.state = state;
    this.activity = activity || this.activity;
    this.tool = tool === undefined ? this.tool : tool;
  }

  update(dt, now) {
    // Smoothly chase target position
    const speed = 0.06 * dt;
    this.x += (this.tx - this.x) * Math.min(1, speed);
    this.y += (this.ty - this.y) * Math.min(1, speed);
    this.bobPhase += dt * 0.004;
    this.toolPhase += dt * 0.008;
    // Speech bubble fade-in shortly after a state change
    const sinceChange = now - this.lastChange;
    if (this.state !== 'IDLE' && sinceChange > 100) {
      this.bubbleAlpha = Math.min(1, this.bubbleAlpha + dt * 0.005);
    } else if (this.state === 'IDLE') {
      this.bubbleAlpha = Math.max(0, this.bubbleAlpha - dt * 0.004);
    }
  }

  draw(ctx, now) {
    const color = STATE_COLORS[this.state] || STATE_COLORS.IDLE;
    const bob = Math.sin(this.bobPhase) * (this.state === 'IDLE' ? 0.4 : 0.8);
    const px = Math.round(this.x);
    const py = Math.round(this.y + bob);

    // --- shadow ---
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px - 4, py + 10, 9, 2);

    // --- legs ---
    let legOffset = 0;
    if (this.state === 'WORKING') {
      // tiny typing leg shuffle
      legOffset = Math.round(Math.sin(this.toolPhase * 2)) === 0 ? 0 : 1;
    }
    ctx.fillStyle = '#2a3142';
    ctx.fillRect(px - 2, py + 7, 2, 3);
    ctx.fillRect(px + 1, py + 7 + legOffset, 2, 3 - legOffset);

    // --- body ---
    ctx.fillStyle = this.color;
    ctx.fillRect(px - 3, py + 1, 7, 6);
    // body shading
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(px + 3, py + 1, 1, 6);
    ctx.fillRect(px - 3, py + 6, 7, 1);
    // state-colored badge on chest
    ctx.fillStyle = color;
    ctx.fillRect(px, py + 3, 1, 1);

    // --- arms ---
    ctx.fillStyle = this.color;
    if (this.state === 'WORKING') {
      // typing pose — arms forward + bobbing
      const arm = Math.round(Math.sin(this.toolPhase * 3));
      ctx.fillRect(px - 4, py + 2 + arm, 1, 2);
      ctx.fillRect(px + 4, py + 2 - arm, 1, 2);
    } else if (this.state === 'THINKING') {
      ctx.fillRect(px - 4, py + 2, 1, 2);
      ctx.fillRect(px + 4, py + 1, 1, 2);  // hand to chin
    } else {
      ctx.fillRect(px - 4, py + 2, 1, 3);
      ctx.fillRect(px + 4, py + 2, 1, 3);
    }

    // --- head ---
    ctx.fillStyle = '#f4d8b0';
    ctx.fillRect(px - 2, py - 3, 5, 4);
    // hair
    ctx.fillStyle = '#1a1d26';
    ctx.fillRect(px - 2, py - 4, 5, 2);
    ctx.fillRect(px - 3, py - 3, 1, 2);
    ctx.fillRect(px + 3, py - 3, 1, 2);
    // eyes
    ctx.fillStyle = '#0a0c11';
    if (this.state === 'ERROR') {
      // x eyes
      ctx.fillRect(px - 1, py - 2, 1, 1);
      ctx.fillRect(px + 2, py - 2, 1, 1);
      ctx.fillRect(px - 1, py - 1, 1, 1);
      ctx.fillRect(px + 2, py - 1, 1, 1);
    } else {
      ctx.fillRect(px - 1, py - 1, 1, 1);
      ctx.fillRect(px + 2, py - 1, 1, 1);
    }

    // --- state outline ring ---
    if (this.state === 'WAITING') {
      this.drawDottedOutline(ctx, px - 5, py - 5, 10, 14, color, now);
    } else if (this.state !== 'IDLE') {
      ctx.fillStyle = color;
      // tiny glow dot above head
      const glow = (Math.sin(now * 0.005) + 1) * 0.5;
      ctx.globalAlpha = 0.5 + glow * 0.5;
      ctx.fillRect(px, py - 6, 1, 1);
      ctx.globalAlpha = 1;
    }

    // --- state indicators above head ---
    if (this.state === 'THINKING') {
      const phase = Math.floor((now * 0.004) % 3);
      ctx.fillStyle = STATE_COLORS.THINKING;
      // floating "?"
      ctx.fillRect(px + 5, py - 7 - phase, 1, 1);
      ctx.fillRect(px + 6, py - 8 - phase, 1, 1);
      ctx.fillRect(px + 7, py - 7 - phase, 1, 1);
      ctx.fillRect(px + 7, py - 6 - phase, 1, 1);
      ctx.fillRect(px + 6, py - 5 - phase, 1, 1);
      ctx.fillRect(px + 6, py - 3 - phase, 1, 1);
    } else if (this.state === 'WORKING') {
      // little "..." typing dots
      const t = Math.floor((now * 0.006) % 3);
      ctx.fillStyle = STATE_COLORS.WORKING;
      ctx.fillRect(px + 5, py + 2, 1, 1);
      if (t > 0) ctx.fillRect(px + 7, py + 2, 1, 1);
      if (t > 1) ctx.fillRect(px + 9, py + 2, 1, 1);
    } else if (this.state === 'ERROR') {
      ctx.fillStyle = STATE_COLORS.ERROR;
      ctx.fillRect(px + 5, py - 7, 1, 4);
      ctx.fillRect(px + 5, py - 2, 1, 1);
    }
  }

  drawDottedOutline(ctx, x, y, w, h, color, now) {
    ctx.fillStyle = color;
    const phase = Math.floor(now * 0.01) % 2;
    for (let i = 0; i < w; i++) {
      if ((i + phase) % 2 === 0) {
        ctx.fillRect(x + i, y, 1, 1);
        ctx.fillRect(x + i, y + h, 1, 1);
      }
    }
    for (let i = 0; i < h; i++) {
      if ((i + phase) % 2 === 0) {
        ctx.fillRect(x, y + i, 1, 1);
        ctx.fillRect(x + w, y + i, 1, 1);
      }
    }
  }

  drawBubble(ctx, scale, font) {
    if (this.bubbleAlpha <= 0.02) return;
    const lines = this.bubbleLines();
    if (!lines.length) return;
    const px = Math.round(this.x);
    const py = Math.round(this.y);
    // Bubble drawn in *screen* space for crisp text — translate from pixel-art coords
    const sx = px * scale;
    const sy = (py - 8) * scale;

    ctx.save();
    ctx.globalAlpha = this.bubbleAlpha;
    ctx.font = font;
    ctx.textBaseline = 'top';
    const padX = 6, padY = 4, lh = 13;
    let w = 0;
    lines.forEach(l => { w = Math.max(w, ctx.measureText(l).width); });
    w = Math.ceil(w) + padX * 2;
    const h = lines.length * lh + padY * 2;
    const bx = sx - Math.floor(w / 2);
    const by = sy - h - 6;

    // bubble body
    ctx.fillStyle = '#151923';
    ctx.strokeStyle = STATE_COLORS[this.state] || '#2a3142';
    ctx.lineWidth = 1;
    this.roundRect(ctx, bx, by, w, h, 3);
    ctx.fill();
    ctx.stroke();

    // tail
    ctx.beginPath();
    ctx.moveTo(sx - 3, by + h);
    ctx.lineTo(sx + 3, by + h);
    ctx.lineTo(sx, by + h + 4);
    ctx.closePath();
    ctx.fillStyle = '#151923';
    ctx.fill();
    ctx.strokeStyle = STATE_COLORS[this.state] || '#2a3142';
    ctx.beginPath();
    ctx.moveTo(sx - 3, by + h);
    ctx.lineTo(sx, by + h + 4);
    ctx.lineTo(sx + 3, by + h);
    ctx.stroke();

    // text
    ctx.fillStyle = '#e6e8ee';
    lines.forEach((l, i) => {
      ctx.fillText(l, bx + padX, by + padY + i * lh);
    });
    ctx.restore();
  }

  bubbleLines() {
    if (this.state === 'IDLE') return [];
    const lines = [];
    if (this.tool) lines.push(`▸ ${this.tool}`);
    if (this.activity) {
      const max = 28;
      let s = this.activity;
      while (s.length > max) {
        let cut = s.lastIndexOf(' ', max);
        if (cut < 10) cut = max;
        lines.push(s.slice(0, cut));
        s = s.slice(cut).trim();
      }
      if (s) lines.push(s);
    }
    return lines.slice(0, 3);
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

window.AgentSprite = AgentSprite;
window.STATE_COLORS = STATE_COLORS;
