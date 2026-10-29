// The background of the whole site: a slow star field that sits behind the
// content, plus the black-hole cursor effect for mouse users. The real
// cursor is never hidden, the canvas ignores clicks, and everything stops
// when the tab is hidden or motion is turned off.
import { useEffect, useRef } from "react";
import { useMotion } from "../../motion/MotionContext.jsx";
import { MOTION } from "../../motion/config.js";

const TAU = Math.PI * 2;
const STAR_WHITE = "#ffffff";

// A four-pointed sparkle (like ✦): thin rays that curve in toward the centre.
function sparklePath(ctx, x, y, len) {
  const k = len * 0.13;
  ctx.beginPath();
  ctx.moveTo(x, y - len);
  ctx.quadraticCurveTo(x + k, y - k, x + len, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + len);
  ctx.quadraticCurveTo(x - k, y + k, x - len, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - len);
  ctx.closePath();
}

export default function CosmicCanvas({ cursor = true }) {
  const ref = useRef(null);
  const { reduced } = useMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    const cfg = MOTION.cursor;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const animate = !reduced;
    const looping = animate && fine; // touch screens get a still star field (saves battery)
    const useCursor = cursor && looping;

    let w = 0;
    let h = 0;
    let field = 0;
    let stars = [];
    let raf = 0;
    let staticRaf = 0;
    let last = 0;
    let frameAvg = 16;
    let frames = 0;
    let quality = 1;
    let scrollY = window.scrollY;
    let hoverEl = null;
    let hover = 0;
    let hoverTarget = 0;
    let pulse = 0;
    const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, inside: false };
    const trail = [];
    const ripples = [];
    const orbiters = Array.from({ length: cfg.orbiters }, () => ({
      a: Math.random() * TAU,
      r: Math.random(),
      s: 0.6 + Math.random() * 1.2,
      size: 0.8 + Math.random() * 1.2,
      cyan: Math.random() < 0.45,
    }));

    const meteors = [];
    let nextShower = 0;
    let streams = [];
    let lastFlip = 0;

    // Rows of 0s and 1s drifting left to right, each at its own speed.
    function randomBits() {
      let out = "";
      while (out.length < 160) {
        const len = 6 + ((Math.random() * 26) | 0);
        for (let i = 0; i < len; i += 1) out += Math.random() < 0.5 ? "0" : "1";
        out += " ".repeat(2 + ((Math.random() * 7) | 0));
      }
      return out;
    }
    // Each row is drawn once onto its own small canvas; every frame only moves
    // that picture. A flipped bit redraws just its own cell. Much lighter than
    // drawing every digit on every frame.
    const BIN_FONT = (size) => `700 ${size}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
    const binDpr = () => Math.min(window.devicePixelRatio || 1, cfg.maxPixelRatio);

    function paintCells(row, from, to) {
      const c = row.ctx;
      const cw = row.cell;
      const lo = Math.max(0, from);
      const hi = Math.min(row.text.length - 1, to);
      c.save();
      c.beginPath();
      c.rect(lo * cw - 1, 0, (hi - lo + 1) * cw + 2, row.h);
      c.clip();
      c.clearRect(lo * cw - 1, 0, (hi - lo + 1) * cw + 2, row.h);
      for (let i = Math.max(0, lo - 1); i <= Math.min(row.text.length - 1, hi + 1); i += 1) {
        if (row.text[i] !== " ") c.strokeText(row.text[i], i * cw, row.h / 2);
      }
      c.restore();
    }

    function makeStreams() {
      const n = Math.max(6, Math.min(cfg.binaryRows, Math.round(h / 42)));
      const band = h / n;
      const dpr = binDpr();
      streams = Array.from({ length: n }, (_, i) => {
        const size = 18 + ((Math.random() * 9) | 0); // big outlined digits
        const text = randomBits();
        ctx.font = BIN_FONT(size);
        const cell = ctx.measureText("0").width;
        const row = {
          y: band * i + band * (0.3 + Math.random() * 0.4),
          size,
          speed: 0.012 + Math.random() * 0.05, // px per ms, different for every row
          offset: Math.random() * 2000,
          text,
          cell,
          width: cell * text.length,
          h: Math.ceil(size * 1.5),
        };
        row.canvas = document.createElement("canvas");
        row.canvas.width = Math.ceil(row.width * dpr);
        row.canvas.height = Math.ceil(row.h * dpr);
        row.ctx = row.canvas.getContext("2d");
        row.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        row.ctx.font = BIN_FONT(size);
        row.ctx.textBaseline = "middle";
        // only the outline of each digit is drawn; the inside stays transparent
        row.ctx.strokeStyle = "rgba(0,0,0,0.95)";
        row.ctx.lineWidth = 1.4;
        paintCells(row, 0, text.length - 1);
        return row;
      });
    }
    function drawStreams(t) {
      if (animate && t - lastFlip > 30 && streams.length) {
        // a few bits change while they travel, like live data
        lastFlip = t;
        for (let k = 0; k < streams.length * 3; k += 1) {
          const row = streams[(Math.random() * streams.length) | 0];
          const i = (Math.random() * row.text.length) | 0;
          if (row.text[i] === " ") continue;
          row.text = row.text.slice(0, i) + (row.text[i] === "0" ? "1" : "0") + row.text.slice(i + 1);
          paintCells(row, i, i);
        }
      }
      for (const row of streams) {
        const shift = ((animate ? t * row.speed : 0) + row.offset) % row.width;
        for (let x = shift - row.width; x < w; x += row.width) ctx.drawImage(row.canvas, x, row.y - row.h / 2, row.width, row.h);
      }
    }

    function makeStars() {
      const count = Math.max(30, Math.round(Math.min(cfg.maxStars, (w * h) / cfg.starDensity) * quality));
      field = h * 1.5;
      stars = Array.from({ length: count }, () => {
        const z = 0.25 + Math.random() * 0.75;
        const sparkle = Math.random() < cfg.sparkleShare;
        return {
          x: Math.random() * w,
          y: Math.random() * field,
          z,
          sparkle,
          // sparkles: ray length in px; dust: dot size
          r: sparkle ? 3.2 + Math.random() * 3.6 + z * 1.6 : 0.6 + Math.random() * 0.8,
          tw: Math.random() * TAU,
          ts: 0.5 + Math.random() * 1.5,
          // sparkle cycle: rays grow from the centre to the tips and back, then rest
          period: 2600 + Math.random() * 4200,
          phase: Math.random(),
        };
      });
    }

    function spawnShower(t) {
      const n = 2 + ((Math.random() * 4) | 0);
      const dir = Math.random() < 0.5 ? -1 : 1; // falls down-left or down-right
      const angle = (0.32 + Math.random() * 0.22) * Math.PI; // steep, like a real shower
      for (let i = 0; i < n; i += 1) {
        const speed = 0.55 + Math.random() * 0.35; // px per ms
        meteors.push({
          x: dir < 0 ? w * (0.35 + Math.random() * 0.75) : w * (-0.1 + Math.random() * 0.75),
          y: -20 + Math.random() * h * 0.35,
          vx: Math.cos(angle) * speed * dir,
          vy: Math.sin(angle) * speed,
          t0: t + i * (140 + Math.random() * 380),
          life: 900 + Math.random() * 700,
          tail: 90 + Math.random() * 110,
          size: 2.6 + Math.random() * 2,
        });
      }
    }

    function drawMeteors(t) {
      if (!nextShower) nextShower = t + 2500 + Math.random() * 4000;
      if (t > nextShower) {
        spawnShower(t);
        nextShower = t + cfg.showerEvery[0] + Math.random() * (cfg.showerEvery[1] - cfg.showerEvery[0]);
      }
      ctx.lineCap = "round";
      for (let i = meteors.length - 1; i >= 0; i -= 1) {
        const m = meteors[i];
        const age = t - m.t0;
        if (age < 0) continue;
        if (age > m.life) {
          meteors.splice(i, 1);
          continue;
        }
        const k = age / m.life;
        const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        const hx = m.x + m.vx * age;
        const hy = m.y + m.vy * age;
        const sp = Math.hypot(m.vx, m.vy);
        const tx = hx - (m.vx / sp) * m.tail;
        const ty = hy - (m.vy / sp) * m.tail;
        const g = ctx.createLinearGradient(hx, hy, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`);
        g.addColorStop(0.3, `rgba(196,181,253,${(0.35 * fade).toFixed(3)})`);
        g.addColorStop(1, "rgba(147,197,253,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.globalAlpha = fade;
        ctx.fillStyle = STAR_WHITE;
        sparklePath(ctx, hx, hy, m.size);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function drawStars(t) {
      const radius = cfg.influence * (1 + hover * 0.3);
      const r2 = radius * radius;
      const bend = useCursor && pointer.inside;
      const px = pointer.x;
      const py = pointer.y;
      for (let i = 0; i < stars.length; i += 1) {
        const s = stars[i];
        let y = (s.y - scrollY * 0.12 * s.z) % field;
        if (y < 0) y += field;
        if (y > h + 4) continue;
        let x = animate ? (s.x + t * 0.0022 * s.z) % w : s.x;

        if (bend) {
          const dx = px - x;
          const dy = py - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2) {
            const d = Math.sqrt(d2) || 1;
            if (d < cfg.core * 1.7) continue; // fell into the core
            const f = 1 - d / radius;
            const pull = f * f * cfg.pull * (0.6 + s.z);
            const ux = dx / d;
            const uy = dy / d;
            x += ux * pull - uy * pull * 0.55;
            y += uy * pull + ux * pull * 0.55;
          }
        }
        for (let k = 0; k < ripples.length; k += 1) {
          const rp = ripples[k];
          const age = (t - rp.t0) / 900;
          if (age < 0 || age >= 1) continue;
          const ring = age * 260;
          const dx = x - rp.x;
          const dy = y - rp.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const band = Math.abs(d - ring);
          if (band < 42) {
            const push = (1 - band / 42) * 11 * (1 - age);
            x += (dx / d) * push;
            y += (dy / d) * push;
          }
        }
        const depth = 0.35 + 0.65 * s.z;
        ctx.fillStyle = STAR_WHITE;
        if (s.sparkle) {
          // 0 = only the centre point, 1 = rays reach the tips
          let grow = 0.6;
          if (animate) {
            const p = (t / s.period + s.phase) % 1;
            grow = p < 0.5 ? Math.sin((p / 0.5) * Math.PI) : 0;
          }
          ctx.globalAlpha = 0.55 * depth + 0.3 * grow;
          ctx.beginPath();
          ctx.arc(x, y, 0.9, 0, TAU);
          ctx.fill();
          if (grow > 0.04) {
            const len = s.r * grow;
            ctx.globalAlpha = 0.16 * grow * depth;
            ctx.beginPath();
            ctx.arc(x, y, len * 0.45, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = Math.min(1, (0.55 + 0.45 * grow) * depth + 0.15);
            sparklePath(ctx, x, y, len);
            ctx.fill();
          }
        } else {
          const twinkle = animate ? 0.45 + 0.55 * Math.sin(t * 0.001 * s.ts + s.tw) : 0.85;
          ctx.globalAlpha = Math.max(0.08, twinkle) * depth * 0.8;
          ctx.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r);
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawTrail(t) {
      while (trail.length && t - trail[0].t > 360) trail.shift();
      if (trail.length < 3) return;
      ctx.lineCap = "round";
      for (let i = 1; i < trail.length; i += 1) {
        const a = trail[i - 1];
        const b = trail[i];
        const life = Math.max(0, 1 - (t - b.t) / 360) * (i / trail.length);
        ctx.strokeStyle = i % 2 ? `rgba(139,92,246,${(life * 0.6).toFixed(3)})` : `rgba(34,211,238,${(life * 0.5).toFixed(3)})`;
        ctx.lineWidth = 0.5 + life * 2.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    function drawRipples(t) {
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const rp = ripples[i];
        const age = (t - rp.t0) / 900;
        if (age >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        if (age < 0) continue;
        const r = age * 260;
        ctx.lineWidth = 1.6 * (1 - age) + 0.3;
        ctx.strokeStyle = `rgba(34,211,238,${(0.55 * (1 - age)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, r, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(168,85,247,${(0.4 * (1 - age)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, r * 0.7, 0, TAU);
        ctx.stroke();
      }
    }

    function ring(x, y, radius, from, to, color, width) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.5);
      ctx.scale(1, 0.36);
      ctx.beginPath();
      ctx.arc(0, 0, radius, from, to);
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function drawHole(t) {
      const x = pointer.x;
      const y = pointer.y;
      const core = cfg.core * (1 + hover * 0.35 + pulse * 0.5);
      const spin = t * 0.0021 * (1 + hover * 1.4);

      const halo = ctx.createRadialGradient(x, y, core * 0.8, x, y, core * 5.5);
      halo.addColorStop(0, `rgba(139,92,246,${(0.24 + pulse * 0.22).toFixed(3)})`);
      halo.addColorStop(0.5, "rgba(59,130,246,0.08)");
      halo.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, core * 5.5, 0, TAU);
      ctx.fill();

      // back half of the spinning disk
      ring(x, y, core * 2.1, spin, spin + Math.PI * 1.2, "rgba(168,85,247,0.85)", 1.6);
      ring(x, y, core * 2.5, spin + 2.2, spin + 2.2 + Math.PI, "rgba(34,211,238,0.75)", 1.1);
      ring(x, y, core * 2.9, spin + 4.1, spin + 4.1 + Math.PI * 0.8, "rgba(139,92,246,0.55)", 0.8);

      const g = ctx.createRadialGradient(x, y, 0, x, y, core * 1.3);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.72, "rgba(1,1,6,0.97)");
      g.addColorStop(1, "rgba(1,1,6,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, core * 1.3, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = `rgba(237,233,255,${(0.55 + pulse * 0.45).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, core * 1.02, 0, TAU);
      ctx.stroke();

      // front edge of the disk crosses in front of the core
      ring(x, y, core * 2.1, 0.2, Math.PI - 0.2, "rgba(221,214,254,0.9)", 1.8);

      for (const o of orbiters) {
        o.a += 0.02 * o.s * (1 + hover * 1.3);
        const r = core * (1.7 + o.r * 2.3);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = o.cyan ? "#67e8f9" : "#c4b5fd";
        ctx.fillRect(x + Math.cos(o.a) * r, y + Math.sin(o.a) * r * 0.45, o.size, o.size);
      }
      ctx.globalAlpha = 1;
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      drawStreams(t);
      drawStars(t);
      if (looping) drawMeteors(t);
      if (useCursor && pointer.inside) {
        drawTrail(t);
        drawRipples(t);
        drawHole(t);
      }
    }

    function frame(t) {
      raf = requestAnimationFrame(frame);
      const dt = last ? t - last : 16;
      last = t;
      pointer.x += (pointer.tx - pointer.x) * 0.38;
      pointer.y += (pointer.ty - pointer.y) * 0.38;
      hover += (hoverTarget - hover) * 0.12;
      pulse *= 0.92;
      draw(t);
      frameAvg = frameAvg * 0.95 + Math.min(dt, 100) * 0.05;
      frames += 1;
      if (frames > 120 && frameAvg > 26 && quality > 0.35) {
        quality *= 0.6;
        frames = 0;
        makeStars();
      }
    }

    function start() {
      if (looping && !raf && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function drawStill() {
      staticRaf = 0;
      draw(performance.now());
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, cfg.maxPixelRatio);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      makeStars();
      makeStreams();
      if (!looping) drawStill();
    }

    const onMove = (e) => {
      if (e.pointerType !== "mouse") return;
      pointer.tx = e.clientX;
      pointer.ty = e.clientY;
      if (!pointer.inside) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.inside = true;
      }
      trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (trail.length > cfg.trail) trail.shift();
      const target = e.target instanceof Element ? e.target.closest("[data-pulse], a, button, input, select, textarea") : null;
      if (target !== hoverEl) {
        hoverEl = target;
        hoverTarget = target ? 1 : 0;
        if (target?.closest("[data-pulse]")) pulse = 1;
      }
    };
    const onDown = (e) => {
      if (e.pointerType !== "mouse") return;
      ripples.push({ x: e.clientX, y: e.clientY, t0: performance.now() });
      if (ripples.length > 4) ripples.shift();
      pulse = 1;
    };
    const onOut = (e) => {
      if (!e.relatedTarget) {
        pointer.inside = false;
        trail.length = 0;
      }
    };
    const onScroll = () => {
      scrollY = window.scrollY;
      if (!looping && animate && !staticRaf) staticRaf = requestAnimationFrame(drawStill);
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (useCursor) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.addEventListener("mouseout", onOut);
    }
    start();

    return () => {
      stop();
      if (staticRaf) cancelAnimationFrame(staticRaf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("mouseout", onOut);
    };
  }, [reduced, cursor]);

  return <canvas ref={ref} className="cosmos" aria-hidden="true" />;
}
