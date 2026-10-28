// Floating hardware in zero gravity. Each piece floats on its own timing,
// shifts with the mouse by its depth, and drifts apart as the hero scrolls
// away. The pictures are illustrations in client/public/hero/ and can be
// swapped for real photos with the same file names.
import { useEffect, useRef } from "react";
import { useMotion } from "../../motion/MotionContext.jsx";
import { MOTION } from "../../motion/config.js";

const PIECES = [
  { key: "mobo", src: "/hero/motherboard.svg", depth: -0.7, float: 13, spin: 1 },
  { key: "laptop", src: "/hero/laptop.svg", depth: -0.3, float: 10, spin: -1 },
  { key: "gpu", src: "/hero/gpu.svg", depth: 0.85, float: 7.5, spin: -1 },
  { key: "cpu", src: "/hero/cpu.svg", depth: 0.55, float: 6.5, spin: 1 },
  { key: "ram", src: "/hero/ram.svg", depth: 0.4, float: 8.5, spin: -1 },
  { key: "ssd", src: "/hero/ssd.svg", depth: 1.1, float: 6, spin: 1 },
];

export default function HeroScene() {
  const ref = useRef(null);
  const { reduced } = useMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (reduced) {
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
      el.style.setProperty("--sp", "0");
      return undefined;
    }
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let target = { x: 0, y: 0 };
    let current = { x: 0, y: 0 };
    let scroll = 0;
    let raf = 0;
    let visible = true;

    const tick = () => {
      raf = 0;
      current.x += (target.x - current.x) * 0.07;
      current.y += (target.y - current.y) * 0.07;
      el.style.setProperty("--px", current.x.toFixed(4));
      el.style.setProperty("--py", current.y.toFixed(4));
      el.style.setProperty("--sp", scroll.toFixed(4));
      if (Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001) schedule();
    };
    const schedule = () => {
      if (!raf && visible) raf = requestAnimationFrame(tick);
    };
    const onMove = (e) => {
      if (e.pointerType !== "mouse") return;
      target = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
      schedule();
    };
    const onScroll = () => {
      const hero = el.closest(".hero");
      const height = hero ? hero.offsetHeight : window.innerHeight;
      scroll = Math.min(1, Math.max(0, window.scrollY / height));
      schedule();
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      el.classList.toggle("is-paused", !visible);
      if (visible) schedule();
    });
    io.observe(el);
    if (fine) window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div
      ref={ref}
      className="hero-scene"
      aria-hidden="true"
      style={{ "--parallax": `${MOTION.hero.parallax}px`, "--tilt": `${MOTION.hero.tilt}deg`, "--drift": `${MOTION.hero.scrollDrift}px` }}
    >
      <svg className="hero-lines" viewBox="0 0 1200 800" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hl-a" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8B5CF6" stopOpacity="0" />
            <stop offset="0.5" stopColor="#8B5CF6" stopOpacity="0.8" />
            <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="hero-lines__p" d="M-40 620 C 260 520, 420 700, 700 560 S 1100 380, 1260 470" />
        <path className="hero-lines__p hero-lines__p--2" d="M-40 260 C 220 180, 520 320, 760 220 S 1080 120, 1260 200" />
        <path className="hero-lines__p hero-lines__p--3" d="M200 840 C 380 640, 640 760, 860 600 S 1140 520, 1260 640" />
      </svg>
      <div className="hero-sweep" />
      {PIECES.map((p) => (
        <div
          key={p.key}
          className={`hw hw--${p.key}`}
          style={{ "--depth": p.depth, "--float": `${p.float}s`, "--spin": p.spin }}
        >
          <div className="hw__float">
            <img src={p.src} alt="" draggable="false" decoding="async" />
          </div>
        </div>
      ))}
    </div>
  );
}
