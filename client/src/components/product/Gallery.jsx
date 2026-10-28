import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../ui/Icon.jsx";
import { NoPhoto, SoldStamp } from "./ProductBits.jsx";

/** Main photo, thumbnails, swipe on phones, and a full-screen zoom view. */
export default function Gallery({ images, name, icon, sold = false }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const swipe = useRef(null);
  const swiped = useRef(false);
  const count = images.length;

  const go = useCallback((delta) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  if (!count) {
    return (
      <div className="gallery">
        <div className="gallery__main gallery__main--empty">
          <NoPhoto icon={icon} large />
          {sold ? <SoldStamp large /> : null}
        </div>
      </div>
    );
  }

  const current = images[Math.min(index, count - 1)];
  const blurred = sold && index === 0;

  return (
    <div className="gallery">
      <div
        className={`gallery__main${blurred ? " is-sold" : ""}`}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || count < 2) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(e.clientY - s.y)) {
            swiped.current = true;
            go(dx < 0 ? 1 : -1);
          }
        }}
      >
        <button
          type="button"
          className="gallery__open"
          onClick={() => {
            if (swiped.current) {
              swiped.current = false;
              return;
            }
            setOpen(true);
          }}
          aria-label={`Open photo ${index + 1} of ${count} full screen`}>
          <img key={current.id} className="gallery__img" src={current.url} alt={`${name}, photo ${index + 1} of ${count}`} decoding="async" />
        </button>
        {blurred ? <SoldStamp large /> : null}
        {count > 1 ? (
          <>
            <button type="button" className="gallery__nav gallery__nav--prev" onClick={() => go(-1)} aria-label="Previous photo">
              <Icon name="chevronLeft" />
            </button>
            <button type="button" className="gallery__nav gallery__nav--next" onClick={() => go(1)} aria-label="Next photo">
              <Icon name="chevronRight" />
            </button>
          </>
        ) : null}
        <span className="gallery__hint">
          <Icon name="search" size={15} /> {index + 1} / {count}
        </span>
      </div>
      {count > 1 ? (
        <div className="gallery__thumbs">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className={`gallery__thumb${i === index ? " is-active" : ""}`}
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
            >
              <img src={img.thumb || img.url} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      ) : null}
      {open ? <Lightbox images={images} index={index} onIndex={setIndex} onClose={() => setOpen(false)} name={name} /> : null}
    </div>
  );
}

function Lightbox({ images, index, onIndex, onClose, name }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const stageRef = useRef(null);
  const drag = useRef(null);
  const closeRef = useRef(null);
  const count = images.length;
  const img = images[index];

  const clamp = useCallback((p, z) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return p;
    const mx = ((z - 1) * r.width) / 2;
    const my = ((z - 1) * r.height) / 2;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  }, []);

  const zoomAt = useCallback(
    (z, clientX, clientY) => {
      const next = Math.max(1, Math.min(4, z));
      const r = stageRef.current?.getBoundingClientRect();
      if (!r || next === 1) {
        setZoom(next);
        setPos({ x: 0, y: 0 });
        return;
      }
      // Keep the point under the pointer in place.
      const dx = (clientX ?? r.left + r.width / 2) - (r.left + r.width / 2);
      const dy = (clientY ?? r.top + r.height / 2) - (r.top + r.height / 2);
      setPos((p) => clamp({ x: dx - ((dx - p.x) * next) / zoom, y: dy - ((dy - p.y) * next) / zoom }, next));
      setZoom(next);
    },
    [clamp, zoom]
  );

  useEffect(() => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && count > 1) onIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft" && count > 1) onIndex((i) => (i - 1 + count) % count);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.5));
      if (e.key === "-") {
        setZoom((z) => Math.max(1, z - 0.5));
        setPos({ x: 0, y: 0 });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [count, onClose, onIndex]);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${name}: photos`}>
      <div
        ref={stageRef}
        className={`lightbox__stage${zoom > 1 ? " is-zoomed" : ""}`}
        onWheel={(e) => zoomAt(zoom + (e.deltaY < 0 ? 0.4 : -0.4), e.clientX, e.clientY)}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, moved: false };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          if (zoom > 1) setPos(clamp({ x: d.px + dx, y: d.py + dy }, zoom));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (zoom === 1 && count > 1 && Math.abs(dx) > 50) {
            onIndex((i) => (i + (dx < 0 ? 1 : -1) + count) % count);
          } else if (!d.moved) {
            zoomAt(zoom > 1 ? 1 : 2.5, e.clientX, e.clientY);
          }
        }}
      >
        <img
          src={img.url}
          alt={`${name}, photo ${index + 1} of ${count}`}
          draggable="false"
          style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${zoom})` }}
        />
      </div>
      <div className="lightbox__bar">
        <span className="lightbox__count num">
          {index + 1} / {count}
        </span>
        <div className="row" style={{ "--gap": "8px" }}>
          <button type="button" className="icon-btn" onClick={() => zoomAt(zoom - 0.5)} aria-label="Zoom out" disabled={zoom <= 1}>
            <Icon name="minus" />
          </button>
          <button type="button" className="icon-btn" onClick={() => zoomAt(zoom + 0.5)} aria-label="Zoom in" disabled={zoom >= 4}>
            <Icon name="plus" />
          </button>
          {count > 1 ? (
            <>
              <button type="button" className="icon-btn" onClick={() => onIndex((i) => (i - 1 + count) % count)} aria-label="Previous photo">
                <Icon name="chevronLeft" />
              </button>
              <button type="button" className="icon-btn" onClick={() => onIndex((i) => (i + 1) % count)} aria-label="Next photo">
                <Icon name="chevronRight" />
              </button>
            </>
          ) : null}
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close photos">
            <Icon name="x" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
