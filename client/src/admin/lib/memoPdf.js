// Builds the sales memo as a PDF file in the browser and downloads it.
// Each A4 page is drawn on a canvas at 250 dpi with the same fonts as the
// memo on screen (League Spartan wordmark, Arial-style text, the ৳ sign and
// Bangla names), then wrapped in a small PDF. No extra package needed.
import { qrMatrix } from "../../lib/qr.js";

const DPI = 250;
const PX_PER_MM = DPI / 25.4;
const PAGE_W = 210;
const PAGE_H = 297;
const LEFT = 16;
const RIGHT = 194;
const INK = "#1c1c1c";
const MUTED = "#444444";
const RULE = "#9a9890";
const PAPER = "#fbf8ec";
const BODY_FONT = 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", "HB Taka", sans-serif';

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const tk = (n) => `৳${fmt.format(Number(n) || 0)}`;
const memoDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }).replace(/ (\d{4})$/, ", $1") : "";

function newPage() {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PAGE_W * PX_PER_MM);
  canvas.height = Math.round(PAGE_H * PX_PER_MM);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "alphabetic";
  const mm = (v) => v * PX_PER_MM;
  const font = (pt, bold = false, family = BODY_FONT) => `${bold ? 700 : 400} ${(pt * DPI) / 72}px ${family}`;
  const api = {
    canvas,
    ctx,
    mm,
    /** Text with its baseline at y (mm). align: left | right | center */
    text(str, x, y, { pt = 11.5, bold = false, color = INK, align = "left", family } = {}) {
      ctx.font = font(pt, bold, family);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(String(str ?? ""), mm(x), mm(y));
    },
    width(str, { pt = 11.5, bold = false, family } = {}) {
      ctx.font = font(pt, bold, family);
      return ctx.measureText(String(str ?? "")).width / PX_PER_MM;
    },
    /** Splits text into lines no wider than maxW (mm). */
    wrap(str, maxW, opts = {}) {
      const words = String(str ?? "").split(/\s+/).filter(Boolean);
      const lines = [];
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && api.width(next, opts) > maxW) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    },
    rule(x1, x2, y, weight = 0.3) {
      ctx.fillStyle = RULE;
      ctx.fillRect(mm(x1), mm(y) - mm(weight) / 2, mm(x2 - x1), Math.max(1, mm(weight)));
    },
  };
  return api;
}

function drawQr(p, text, x, y, size) {
  const { size: n, modules } = qrMatrix(text);
  const total = n + 8;
  const cell = size / total;
  p.ctx.fillStyle = "#ffffff";
  p.ctx.fillRect(p.mm(x), p.mm(y), p.mm(size), p.mm(size));
  p.ctx.fillStyle = "#111111";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r][c]) {
        // Snap to whole pixels so the squares stay sharp.
        const x0 = Math.round(p.mm(x + (c + 4) * cell));
        const y0 = Math.round(p.mm(y + (r + 4) * cell));
        const x1 = Math.round(p.mm(x + (c + 5) * cell));
        const y1 = Math.round(p.mm(y + (r + 5) * cell));
        p.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
  }
}

// Table columns (mm)
const COL_DESC = LEFT + 1;
const DESC_W = 98;
const COL_UNIT = 126.5; // centre
const COL_PRICE = 164.5; // right edge
const COL_AMOUNT = RIGHT - 1; // right edge

function tableHead(p, y) {
  p.rule(LEFT, RIGHT, y);
  p.text("Description", COL_DESC, y + 5.6, { pt: 11, bold: true });
  p.text("Unit", COL_UNIT, y + 5.6, { pt: 11, bold: true, align: "center" });
  p.text("Price", COL_PRICE, y + 5.6, { pt: 11, bold: true, align: "right" });
  p.text("Amount", COL_AMOUNT, y + 5.6, { pt: 11, bold: true, align: "right" });
  p.rule(LEFT, RIGHT, y + 8.3);
  return y + 8.3;
}

function drawHeader(p, w) {
  // Wordmark
  p.text("hyperByte", LEFT - 0.6, 38, { pt: 54, bold: true, family: '"HB Logo", "League Spartan", "Arial Black", sans-serif', color: "#111111" });
  p.text(`Date: ${memoDate(w.date)}`, RIGHT, 31.2, { pt: 11, align: "right" });
  if (w.invoiceNo) p.text(`Invoice No. ${w.invoiceNo}`, RIGHT, 39, { pt: 11, bold: true, align: "right" });
  p.rule(LEFT, RIGHT, 49);

  // Billed to, warranty code
  p.text("Billed to:", LEFT, 59, { bold: true });
  p.text(w.customerName, LEFT, 67, {});
  p.text(w.customerPhone, LEFT, 72.8, {});
  p.text("Warranty code", 126.3, 59, { bold: true });
  p.text(w.code, 126.3, 67, {});
  p.rule(LEFT, RIGHT, 81);
  return 88;
}

function drawFooter(p, w, checkUrl) {
  const s = w.seller || {};
  const top = 239.5;
  p.rule(LEFT, RIGHT, top);
  p.text("Payment Information", LEFT, top + 9.5, { bold: true });
  p.text(w.payment || "", LEFT, top + 28, {});
  const x = 97.2;
  p.text(s.name || "hyperByte", x, top + 9.5, { bold: true });
  const lines = [s.address, s.phone, s.facebook].filter(Boolean);
  const y0 = top + 28 - (lines.length - 1) * 5.7;
  lines.forEach((line, i) => p.text(line, x, y0 + i * 5.7, {}));
  drawQr(p, checkUrl, RIGHT - 12.5, top + 18.3, 12.5);
  p.rule(LEFT, RIGHT, 275);
}

/** Draws the memo on one or more pages and returns the canvases. */
async function drawMemo(w, checkUrl) {
  // Make sure the fonts are ready before drawing (canvas does not wait for them).
  try {
    await Promise.all([document.fonts.load('700 40px "HB Logo"', "hyperByte"), document.fonts.load('16px "HB Taka"', "৳")]);
  } catch {
    // Drawing still works with fallback fonts.
  }
  const pages = [];
  let p = newPage();
  pages.push(p);
  let y = tableHead(p, drawHeader(p, w));
  const footerTop = 239.5;
  const totalsH = 12 + (w.discount > 0 ? 3 : 2) * 11;

  w.items.forEach((it, index) => {
    const nameLines = p.wrap(it.name, DESC_W, {});
    const sn = it.serials.length ? p.wrap(`SN: ${it.serials.join(", ")}`, DESC_W, {}) : [];
    const sub = it.line ? p.wrap(it.line, DESC_W, { pt: 10 }) : [];
    const rowH = 4 + nameLines.length * 6 + sn.length * 6 + sub.length * 5.3 + 4;
    const isLast = index === w.items.length - 1;
    const room = isLast ? footerTop - totalsH : PAGE_H - 22;
    if (y + rowH > room && y > 100) {
      p = newPage();
      pages.push(p);
      y = tableHead(p, 24);
    }
    let ty = y + 4 + 4.6;
    nameLines.forEach((line) => {
      p.text(line, COL_DESC, ty, {});
      ty += 6;
    });
    sn.forEach((line) => {
      p.text(line, COL_DESC, ty, {});
      ty += 6;
    });
    sub.forEach((line) => {
      p.text(line, COL_DESC, ty - 0.4, { pt: 10, color: MUTED });
      ty += 5.3;
    });
    p.text(String(it.quantity), COL_UNIT, y + 8.6, { align: "center" });
    if (it.unitPrice !== null) p.text(tk(it.unitPrice), COL_PRICE, y + 8.6, { align: "right" });
    if (it.amount !== null) p.text(tk(it.amount), COL_AMOUNT, y + 8.6, { align: "right" });
    y += rowH;
    p.rule(LEFT, RIGHT, y);
  });

  // Totals
  if (y + totalsH > footerTop) {
    p = newPage();
    pages.push(p);
    y = 24;
  }
  const tx = 132;
  let ry = y + 12;
  const row = (label, value, last = false) => {
    p.text(label, tx, ry, { bold: true });
    p.text(value, RIGHT, ry, { bold: last, align: "right" });
    if (!last) p.rule(tx, RIGHT, ry + 5.2);
    ry += 11;
  };
  row("Subtotal", tk(w.subtotal));
  if (w.discount > 0) row("Discount", `−${tk(w.discount)}`);
  row("Total", tk(w.total), true);

  drawFooter(p, w, checkUrl);
  return pages.map((page) => page.canvas);
}

// ------------------------------------------------------------------ PDF

const enc = new TextEncoder();

function canvasJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b))) : reject(new Error("Could not create the image."))),
      "image/jpeg",
      0.92
    );
  });
}

/** A minimal PDF: one JPEG image per A4 page. */
function buildPdf(images, title) {
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const W = 595.28;
  const H = 841.89;
  const n = images.length;
  // Objects: 1 catalog, 2 pages, 3 info, then per page: page, content, image
  const pageObj = (i) => 4 + i * 3;
  const obj = (num, body) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
    if (typeof body === "string") push(body);
    else body();
    push("\nendobj\n");
  };
  const pdfString = (str) => `(${String(str).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "")})`;

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${images.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] >>`);
  obj(3, `<< /Title ${pdfString(title)} /Producer (HyperByte) >>`);
  images.forEach((img, i) => {
    const p = pageObj(i);
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(p + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(p + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      push(img.bytes);
      push("\nendstream");
    });
  });
  const xrefAt = length;
  const count = 4 + n * 3;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

/**
 * Builds the memo PDF and starts the download. `w` is the memo as it was
 * issued (warranty.memo from the API), so a later download looks the same.
 */
export async function downloadMemoPdf(w) {
  const site = (w.seller?.site || "https://yourhyperbyte.com").replace(/\/+$/, "");
  const checkUrl = `${site}/warranty?code=${w.code}`;
  const canvases = await drawMemo(w, checkUrl);
  const images = [];
  for (const c of canvases) images.push({ width: c.width, height: c.height, bytes: await canvasJpeg(c) });
  const name = `HyperByte-Memo-${w.invoiceNo || w.code}`;
  const blob = buildPdf(images, name);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
