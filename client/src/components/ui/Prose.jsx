import { useLayoutEffect, useRef, useState } from "react";
import { textBlocks } from "../../lib/format.js";
import Icon from "./Icon.jsx";

/** Plain text from the admin panel shown as headings, paragraphs and lists. */
export default function Prose({ text, className = "", headingLevel = 2 }) {
  const H = `h${headingLevel}`;
  return (
    <div className={`prose ${className}`}>
      {textBlocks(text).map((b, i) => {
        if (b.type === "h") return <H key={i}>{b.text}</H>;
        if (b.type === "list")
          return (
            <ul key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={i}>
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ol>
          );
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {line}
                {j < b.lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Long text is cut to a few lines with a "See more" button. */
export function CollapsibleProse({ text, maxHeight = 260 }) {
  const ref = useRef(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    if (ref.current) setLong(ref.current.scrollHeight > maxHeight + 60);
  }, [text, maxHeight]);
  return (
    <div className={`collapsible${long && !open ? " is-collapsed" : ""}`}>
      <div ref={ref} className="collapsible__body" style={long && !open ? { maxHeight } : undefined} id="collapsible-body">
        <Prose text={text} headingLevel={3} />
      </div>
      {long ? (
        <button type="button" className="btn btn--ghost btn--sm collapsible__toggle" aria-expanded={open} aria-controls="collapsible-body" onClick={() => setOpen((o) => !o)}>
          {open ? "See less" : "See more"} <Icon name={open ? "chevronUp" : "chevronDown"} size={16} />
        </button>
      ) : null}
    </div>
  );
}
