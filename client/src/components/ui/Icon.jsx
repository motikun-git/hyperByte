import { createElement } from "react";
import { ICONS } from "./iconData.js";

// Our own graphics-card outline (the icon set has none).
const CUSTOM = {
  gpu: {
    k: 0,
    v: "0 0 24 24",
    c: [
      ["rect", { x: "2", y: "6", width: "20", height: "11", rx: "2" }],
      ["circle", { cx: "8", cy: "11.5", r: "2.8" }],
      ["circle", { cx: "16", cy: "11.5", r: "2.8" }],
      ["path", { d: "M6 17v2.5h9V17" }],
      ["path", { d: "M2 4v15" }],
    ],
  },
  case: {
    k: 0,
    v: "0 0 24 24",
    c: [
      ["rect", { x: "6", y: "2", width: "12", height: "20", rx: "2" }],
      ["circle", { cx: "12", cy: "15", r: "3" }],
      ["path", { d: "M10 6h4" }],
    ],
  },
};

function render(nodes) {
  return nodes.map(([tag, attr, kids], i) => createElement(tag, { key: i, ...attr }, kids ? render(kids) : undefined));
}

export default function Icon({ name, size = 20, strokeWidth = 2, className = "", title, ...rest }) {
  const icon = CUSTOM[name] || ICONS[name];
  if (!icon) return null;
  const paint = icon.k
    ? { fill: "currentColor" }
    : { fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" };
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: icon.v,
      className: `icon ${className}`,
      "aria-hidden": title ? undefined : true,
      role: title ? "img" : undefined,
      focusable: "false",
      ...paint,
      ...rest,
    },
    title ? createElement("title", { key: "t" }, title) : null,
    ...render(icon.c)
  );
}

const CATEGORY_ICON = {
  cpu: "cpu",
  gpu: "gpu",
  ram: "memoryStick",
  storage: "hardDrive",
  motherboard: "circuitBoard",
  psu: "plugZap",
  laptop: "laptop",
  case: "case",
  fan: "fan",
  monitor: "monitor",
  keyboard: "keyboard",
  mouse: "mouse",
  other: "microchip",
};

export function CategoryIcon({ type, ...rest }) {
  return <Icon name={CATEGORY_ICON[type] || "microchip"} {...rest} />;
}
