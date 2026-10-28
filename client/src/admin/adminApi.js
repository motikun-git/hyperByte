// API helpers for the admin panel: session handling, uploads with progress,
// and shrinking big phone photos before they are sent.
import { api, ApiError, getCsrf, setCsrf } from "../lib/api.js";

let onSignedOut = () => {};
/** Called when the server says the session has ended (401). */
export const setSignedOutHandler = (fn) => {
  onSignedOut = fn || (() => {});
};

const isAuthPath = (path) => path.startsWith("/admin/login") || path.startsWith("/admin/me") || path.startsWith("/admin/setup") || path.startsWith("/admin/status");

/** Refreshes the CSRF token from the current session. Returns false when logged out. */
async function refreshToken() {
  try {
    const me = await api("/admin/me");
    setCsrf(me.csrf);
    return true;
  } catch {
    return false;
  }
}

/** Like api(), plus: a stale security token is refreshed once, and a lost session signs out. */
export async function adminApi(path, options = {}) {
  try {
    return await api(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403 && /session token/i.test(err.message) && !options._retried) {
      if (await refreshToken()) return adminApi(path, { ...options, _retried: true });
    }
    if (err instanceof ApiError && err.status === 401 && !isAuthPath(path)) onSignedOut();
    throw err;
  }
}

/** Uploads one file as multipart form data, reporting progress from 0 to 1. */
export function uploadFile(path, field, file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.setRequestHeader("Accept", "application/json");
    const token = getCsrf();
    if (token) xhr.setRequestHeader("X-CSRF-Token", token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      if (xhr.status === 401) onSignedOut();
      const fallback = xhr.status === 413 ? "This photo is larger than the server allows." : `Upload failed (${xhr.status}).`;
      reject(new ApiError(data?.message || fallback, xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError("The upload stopped. Check your internet connection and try again.", 0));
    xhr.onabort = () => reject(new ApiError("Upload cancelled.", 0));
    const form = new FormData();
    form.append(field, file, file.name || "photo.jpg");
    xhr.send(form);
  });
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/**
 * Phone photos are often 4000 px wide and several MB, which is slow on mobile
 * data and can exceed the hosting upload limit. This scales them down (the
 * server keeps at most 1800 px anyway) and re-encodes them. Small JPG, PNG and
 * WebP files are sent unchanged. If the browser cannot read the file, it is
 * sent as it is and the server explains what is wrong.
 */
export async function prepareImage(file, { maxSide = 2200, quality = 0.86 } = {}) {
  if (ACCEPTED.includes(file.type) && file.size <= 1.2 * 1024 * 1024) return file;
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      source = await loadImage(file);
    } catch {
      return file;
    }
  }
  const width = source.width;
  const height = source.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  let blob = await toBlob(canvas, "image/webp", quality);
  let ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    // Safari cannot make WebP: use JPG on a white background (JPG has no transparency).
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    blob = await toBlob(canvas, "image/jpeg", quality);
    ext = "jpg";
  }
  source.close?.();
  if (!blob || (blob.size >= file.size && ACCEPTED.includes(file.type))) return file;
  const base = (file.name || "photo").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}
