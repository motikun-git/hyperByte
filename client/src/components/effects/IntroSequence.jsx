// A short opening (about 2.5 s) on the first visit to the home page in a
// browser session: an energy line, particles that gather into the wordmark,
// a light sweep, then the site. Click, press any key or "Skip intro" to end it.
import { useEffect, useRef, useState } from "react";
import { MOTION } from "../../motion/config.js";

const WORD = "hyperByte";

export function shouldPlayIntro(reduced) {
  if (reduced) return false;
  try {
    return !sessionStorage.getItem(MOTION.intro.sessionKey);
  } catch {
    return false;
  }
}

export default function IntroSequence({ onDone }) {
  const [phase, setPhase] = useState("line"); // line -> gather -> sweep -> exit
  const canvasRef = useRef(null);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      sessionStorage.setItem(MOTION.intro.sessionKey, "1");
    } catch {
      // ignore
    }
    setPhase("exit");
    window.setTimeout(() => onDone?.(), 420);
  };

  // Timeline
  useEffect(() => {
    const total = MOTION.intro.duration;
    const timers = [
      window.setTimeout(() => setPhase("gather"), 380),
      window.setTimeout(() => setPhase("sweep"), 1350),
      window.setTimeout(finish, total - 420),
    ];
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    document.documentElement.classList.add("intro-lock");
    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener("keydown", skip);
      document.documentElement.classList.remove("intro-lock");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Particles that converge on the wordmark
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = w / 2;
    const cy = h / 2;
    const spanX = Math.min(w * 0.8, 760) / 2;
    const count = w < 600 ? 90 : 160;
    const parts = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.max(w, h) * (0.55 + Math.random() * 0.4);
      return {
        sx: cx + Math.cos(angle) * dist,
        sy: cy + Math.sin(angle) * dist,
        tx: cx + (Math.random() * 2 - 1) * spanX,
        ty: cy + (Math.random() * 2 - 1) * 26,
        delay: Math.random() * 380,
        size: 0.8 + Math.random() * 1.6,
        cyan: Math.random() < 0.4,
      };
    });
    const t0 = performance.now() + 300;
    let raf = 0;
    const ease = (p) => 1 - Math.pow(1 - p, 3);
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        const raw = (now - t0 - p.delay) / 900;
        if (raw <= 0) continue;
        const k = ease(Math.min(1, raw));
        const fade = raw > 1 ? Math.max(0, 1 - (raw - 1) * 2.2) : 1;
        if (fade <= 0) continue;
        const x = p.sx + (p.tx - p.sx) * k;
        const y = p.sy + (p.ty - p.sy) * k;
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.cyan ? "#67e8f9" : "#c4b5fd";
        ctx.fillRect(x, y, p.size, p.size);
        if (raw < 1) {
          ctx.globalAlpha = fade * 0.25;
          ctx.fillRect(x - (p.tx - p.sx) * 0.03, y - (p.ty - p.sy) * 0.03, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`intro intro--${phase}`} onClick={finish} role="presentation">
      <canvas ref={canvasRef} className="intro__particles" aria-hidden="true" />
      <div className="intro__line" aria-hidden="true" />
      <div className="intro__word" aria-hidden="true">
        {[...WORD].map((ch, i) => (
          <span key={i} className="intro__letter" style={{ "--i": i }}>
            {ch}
          </span>
        ))}
        <span className="intro__shine">{WORD}</span>
      </div>
      <p className="intro__tag" aria-hidden="true">
        Second-hand PC hardware in Dhaka
      </p>
      <button
        type="button"
        className="intro__skip"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
      >
        Skip intro
      </button>
    </div>
  );
}
