// Text and reveal effects. All text stays real, selectable HTML; the
// animated copies are hidden from screen readers.
import { createElement, useEffect, useRef, useState } from "react";
import { useInView } from "../../motion/useInView.js";
import { useMotion } from "../../motion/MotionContext.jsx";
import { MOTION } from "../../motion/config.js";

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({ as = "div", className = "", delay = 0, style, children, ...rest }) {
  const [ref, inView] = useInView();
  return createElement(
    as,
    { ref, className: `reveal${inView ? " is-in" : ""} ${className}`, style: { "--delay": `${delay}ms`, ...style }, ...rest },
    children
  );
}

/** Headline that assembles letter by letter (blur + rise). */
export function SplitChars({ text, as = "span", className = "", play = true, baseDelay = 0 }) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let index = 0;
  return createElement(
    as,
    { className: `split${play ? " is-in" : ""} ${className}`, style: { "--base": `${baseDelay}ms`, "--stagger": `${MOTION.stagger.chars}ms` } },
    <span className="sr-only">{text}</span>,
    <span aria-hidden="true">
      {words.map((word, w) => (
        <span key={`${word}-${w}`}>
          <span className="split__word">
            {[...word].map((ch, c) => (
              <span key={c} className="split__char" style={{ "--i": index++ }}>
                {ch}
              </span>
            ))}
          </span>
          {w < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

/** Cycles through phrases in a box sized for the longest one, so nothing jumps. */
export function RotatingText({ items, interval = MOTION.phrases.interval, className = "" }) {
  const { reduced } = useMotion();
  const list = (items || []).filter(Boolean);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || list.length < 2) return undefined;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % list.length), interval);
    return () => window.clearInterval(id);
  }, [reduced, list.length, interval]);

  if (!list.length) return null;
  const leaving = (index - 1 + list.length) % list.length;
  return (
    <span className={`rotator ${className}`}>
      <span className="sr-only">{list.join(" ")}</span>
      <span className="rotator__stage" aria-hidden="true">
        {list.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className={`rotator__item${i === index ? " is-active" : ""}${list.length > 1 && i === leaving ? " is-leaving" : ""}`}
          >
            {item}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Section heading: words rise out of masks on scroll, a light follows the pointer on hover. */
export function SectionHeading({ as = "h2", text, className = "", id }) {
  const [ref, inView] = useInView();
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--hx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--hy", `${e.clientY - r.top}px`);
  };
  const onLeave = (e) => e.currentTarget.style.setProperty("--hx", "-400px");
  return createElement(
    as,
    { ref, id, className: `section-heading${inView ? " is-in" : ""} ${className}`, onPointerMove: onMove, onPointerLeave: onLeave },
    <span className="sr-only">{text}</span>,
    <span aria-hidden="true" className="section-heading__words">
      {words.map((w, i) => (
        <span key={`${w}-${i}`}>
          <span className="sh__mask">
            <span className="sh__word" style={{ "--i": i }}>
              {w}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

/** Huge outlined word behind a section that drifts slowly with scrolling. */
export function BigWord({ children, className = "", speed = 0.12 }) {
  const ref = useRef(null);
  const { reduced } = useMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return undefined;
    let raf = 0;
    let visible = false;
    const update = () => {
      raf = 0;
      if (!visible) return;
      const r = el.getBoundingClientRect();
      const progress = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      el.style.setProperty("--shift", `${(progress * speed * 100).toFixed(2)}%`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) onScroll();
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, speed]);

  return (
    <div ref={ref} className={`bigword ${className}`} aria-hidden="true">
      {children}
    </div>
  );
}

/** A thin line that draws itself across the page between sections. */
export function Separator() {
  const [ref, inView] = useInView({ threshold: 0.6 });
  return <div ref={ref} className={`separator${inView ? " is-in" : ""}`} aria-hidden="true" />;
}
