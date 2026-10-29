// Links that open WhatsApp or Facebook, and the texts they carry. Numbers and
// pages come from Admin -> Settings; nothing is hard-coded here.
import { taka } from "./format.js";

/** The number for general WhatsApp buttons: Admin (BD) if set, otherwise Admin (CN). */
export function mainWhatsapp(settings) {
  return settings?.whatsappNumber || settings?.whatsappNumberCn || "";
}

export function whatsappLink(number, text) {
  if (!number) return "";
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** "01712-345678" or "+880 1712 345678" -> "8801712345678" (or "" if it is not a Bangladeshi mobile number). */
export function toWaNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return `88${digits}`;
  if (/^8801\d{9}$/.test(digits)) return digits;
  return "";
}

const statusWord = (status) => ({ available: "Available", preorder: "Pre-order", sold: "Sold", unavailable: "Unavailable" })[status] || status;

export function productMessage(product) {
  if (product.status === "sold") {
    return `Hello hyperByte, I saw ${product.name} (ID: ${product.id}) is sold. Do you have something similar?`;
  }
  if (product.status === "unavailable") {
    return `Hello hyperByte, I am interested in ${product.name} (ID: ${product.id}). Will it be available again?`;
  }
  return `Hello hyperByte, I am interested in ${product.name} (ID: ${product.id}). Current status: ${statusWord(product.status)}. Please provide more details.`;
}

export const generalMessage = "Hello hyperByte, I have a question about your products.";

/** Messenger link if set, otherwise the Facebook Page. */
export const facebookChat = (settings) => settings?.messengerUrl || settings?.facebookUrl || "";

/**
 * The Facebook Page message link (m.me), the same on phones and computers.
 * Messenger cannot take the text in the link reliably, so it is copied first.
 */
export function messengerLink(url) {
  return url || "";
}

export function mapLink(settings) {
  if (settings?.mapUrl) return settings.mapUrl;
  if (!settings?.address) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`;
}

/** The text behind "Copy product details", built from the real product data. */
export function productDetails(product, settings, url) {
  const lines = ["hyperByte — Product Inquiry", ""];
  lines.push(`Product: ${product.name}`);
  lines.push(`Product ID: ${product.id}`);
  if (product.category) lines.push(`Category: ${product.category.name}${product.subcategory ? ` / ${product.subcategory.name}` : ""}`);
  const brandModel = [product.brand, product.model].filter(Boolean).join(" ");
  if (brandModel) lines.push(`Brand / model: ${brandModel}`);
  if (product.conditionLabel) lines.push(`Condition: ${product.conditionLabel}`);
  lines.push(`Price: ${product.price === null || product.price === undefined ? "Contact for price" : taka(product.price)}`);
  lines.push(`Status: ${statusWord(product.status)}${product.expectedAvailability ? ` (expected: ${product.expectedAvailability})` : ""}`);
  const specs = (product.specs || []).slice(0, 8).map((s) => `${s.key}: ${s.value}`);
  if (specs.length) lines.push(`Specifications: ${specs.join("; ")}`);
  if (product.warrantyInfo) lines.push(`Warranty: ${product.warrantyInfo}`);
  if (url) lines.push(`Product link: ${url}`);
  const contact = [];
  if (mainWhatsapp(settings)) contact.push(`WhatsApp: +${mainWhatsapp(settings)}`);
  if (settings?.facebookUrl) contact.push(`Facebook: ${settings.facebookUrl}`);
  if (contact.length) lines.push(...["", ...contact]);
  lines.push("", "Please contact hyperByte for current availability and further details.");
  return lines.join("\n");
}

/** WhatsApp text for a custom PC build, with the optional details the visitor filled in. */
export function customBuildText(settings, { budget = "", use = "", notes = "" } = {}) {
  const base = settings?.customBuildMessage || "Hello hyperByte, I would like to discuss a custom PC build. Please help me with compatible components and pricing.";
  const extra = [];
  if (budget.trim()) extra.push(`Budget: ${budget.trim()}`);
  if (use.trim()) extra.push(`Main use: ${use.trim()}`);
  if (notes.trim()) extra.push(`Notes: ${notes.trim()}`);
  return extra.length ? `${base}\n\n${extra.join("\n")}` : base;
}
