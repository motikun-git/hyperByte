const takaFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 125000 -> "৳1,25,000" (Bangladeshi grouping) */
export const taka = (n) => (n === null || n === undefined ? "" : `৳${takaFormat.format(Math.round(Number(n)))}`);

const dhaka = { timeZone: "Asia/Dhaka" };

export const dateLong = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { ...dhaka, day: "numeric", month: "long", year: "numeric" }) : "";

export const dateShort = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { ...dhaka, day: "numeric", month: "short", year: "numeric" }) : "";

export const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { ...dhaka, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

/** "2026-10-27" in Dhaka time, for <input type="date"> */
export const dhakaDateInput = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-CA", { ...dhaka, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

export function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return dateShort(iso);
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Splits plain text into blocks for display:
 * "## Heading", "- bullet" lines, "1. step" lines and paragraphs
 * (an empty line starts a new paragraph).
 */
export function textBlocks(text) {
  const blocks = [];
  let para = null;
  let list = null;
  const flush = () => {
    if (para) blocks.push(para);
    if (list) blocks.push(list);
    para = null;
    list = null;
  };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    let m = line.match(/^#{2,3}\s+(.+)$/);
    if (m) {
      flush();
      blocks.push({ type: "h", text: m[1] });
      continue;
    }
    const bullet = line.match(/^[-•*]\s+(.+)$/);
    const step = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || step) {
      const type = bullet ? "list" : "ol";
      if (para) {
        blocks.push(para);
        para = null;
      }
      if (!list || list.type !== type) {
        if (list) blocks.push(list);
        list = { type, items: [] };
      }
      list.items.push((bullet || step)[1]);
      continue;
    }
    if (list) {
      blocks.push(list);
      list = null;
    }
    if (!para) para = { type: "p", lines: [] };
    para.lines.push(line);
  }
  flush();
  return blocks;
}
