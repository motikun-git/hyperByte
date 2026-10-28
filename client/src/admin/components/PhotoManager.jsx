// Product photos: add (from the phone camera or files), reorder, remove.
// The first photo is the cover: it is shown on product cards, and blurred
// with a SOLD stamp when the product is sold.
//
// New products keep the chosen photos in the browser until the product is
// saved for the first time; after that, photos upload one by one right away.
import { useEffect, useRef, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { ConfirmDialog } from "../../components/ui/Modal.jsx";
import { adminApi, prepareImage, uploadFile } from "../adminApi.js";

const MAX = 10;
let counter = 0;
const uid = () => `p${Date.now().toString(36)}${(counter += 1)}`;

export default function PhotoManager({ productId, images = [], onProductChange, pending = [], onPendingChange }) {
  const toast = useToast();
  const isNew = !productId;
  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState({ from: null, over: null });
  const [dropActive, setDropActive] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const inputRef = useRef(null);

  // Free the local previews when leaving the page.
  const previews = useRef(new Set());
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const preview = (file) => {
    const url = URL.createObjectURL(file);
    previews.current.add(url);
    return url;
  };

  const tiles = isNew ? pending.map((p) => ({ key: p.key, url: p.preview, name: p.file.name })) : images.map((img) => ({ key: img.id, url: img.thumb || img.url, id: img.id }));
  const used = tiles.length + uploads.filter((u) => !u.error).length;

  const addFiles = async (list) => {
    const files = [...list].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    if (!files.length) return;
    const room = MAX - used;
    if (room <= 0) {
      toast(`A product can have up to ${MAX} photos. Remove some first.`, "error");
      return;
    }
    const chosen = files.slice(0, room);
    if (files.length > room) toast(`Only ${room} more photo${room === 1 ? "" : "s"} fit, so the rest were skipped.`, "error");

    if (isNew) {
      setBusy(true);
      const prepared = [];
      for (const f of chosen) {
        const file = await prepareImage(f);
        prepared.push({ key: uid(), file, preview: preview(file) });
      }
      onPendingChange([...pending, ...prepared]);
      setBusy(false);
      return;
    }

    const entries = chosen.map((file) => ({ key: uid(), file, name: file.name, url: preview(file), progress: 0, error: "" }));
    setUploads((u) => [...u, ...entries]);
    for (const entry of entries) {
      try {
        const file = await prepareImage(entry.file);
        const res = await uploadFile(`/admin/products/${productId}/images`, "images", file, {
          onProgress: (progress) => setUploads((u) => u.map((x) => (x.key === entry.key ? { ...x, progress } : x))),
        });
        onProductChange(res.product);
        setUploads((u) => u.filter((x) => x.key !== entry.key));
      } catch (err) {
        setUploads((u) => u.map((x) => (x.key === entry.key ? { ...x, error: err.message } : x)));
      }
    }
  };

  const move = async (from, to) => {
    if (to < 0 || to >= tiles.length || from === to) return;
    if (isNew) {
      const next = [...pending];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onPendingChange(next);
      return;
    }
    const ids = images.map((img) => img.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    setBusy(true);
    try {
      const res = await adminApi(`/admin/products/${productId}/images/order`, { method: "PUT", body: { ids } });
      onProductChange(res.product);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (index) => {
    if (isNew) {
      onPendingChange(pending.filter((_, i) => i !== index));
      return;
    }
    setDeleting(images[index]);
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      const res = await adminApi(`/admin/products/${productId}/images/${deleting.id}`, { method: "DELETE" });
      onProductChange(res.product);
      setDeleting(null);
      toast("Photo removed");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const onDrop = (e, index) => {
    e.preventDefault();
    if (drag.from !== null && index !== null) move(drag.from, index);
    setDrag({ from: null, over: null });
  };

  return (
    <div className="stack" style={{ "--gap": "10px" }}>
      <div className="a-photos" aria-busy={busy || undefined}>
        {tiles.map((t, i) => (
          <div
            key={t.key}
            className={`a-photo${drag.from === i ? " is-dragging" : ""}${drag.over === i && drag.from !== i ? " is-over" : ""}`}
            draggable={!busy}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDrag({ from: i, over: null });
            }}
            onDragOver={(e) => {
              if (drag.from === null) return;
              e.preventDefault();
              if (drag.over !== i) setDrag((d) => ({ ...d, over: i }));
            }}
            onDrop={(e) => onDrop(e, i)}
            onDragEnd={() => setDrag({ from: null, over: null })}
          >
            <img src={t.url} alt={`Photo ${i + 1}`} draggable="false" />
            {i === 0 ? <span className="a-photo__cover">Cover</span> : null}
            <div className="a-photo__tools">
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0 || busy} aria-label={`Move photo ${i + 1} left`} title={i === 1 ? "Make this the cover" : "Move left"}>
                <Icon name="arrowLeft" size={15} />
              </button>
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === tiles.length - 1 || busy} aria-label={`Move photo ${i + 1} right`} title="Move right">
                <Icon name="arrowRight" size={15} />
              </button>
              <button type="button" className="is-danger" onClick={() => remove(i)} disabled={busy} aria-label={`Remove photo ${i + 1}`} title="Remove">
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>
        ))}

        {uploads.map((u) => (
          <div key={u.key} className={`a-photo${u.error ? " a-photo--error" : ""}`}>
            <img src={u.url} alt="" />
            <div className="a-photo__progress" role="status">
              {u.error ? (
                <>
                  <span>{u.error}</span>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setUploads((list) => list.filter((x) => x.key !== u.key))}>
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <span>{u.progress >= 1 ? "Saving..." : `Uploading ${Math.round(u.progress * 100)}%`}</span>
                  <span className="a-photo__bar">
                    <span style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </span>
                </>
              )}
            </div>
          </div>
        ))}

        {used < MAX ? (
          <label
            className={`a-drop${dropActive ? " is-over" : ""}`}
            onDragOver={(e) => {
              if (drag.from !== null) return;
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              setDropActive(false);
              if (drag.from !== null) return;
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
          >
            {busy ? <span className="spinner spinner--sm" /> : <Icon name="imagePlus" size={26} strokeWidth={1.6} />}
            <span>{tiles.length ? "Add photos" : "Add photos of the item"}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
      <p className="field__hint">
        {used}/{MAX} photos. Use real photos of this exact item. The first photo is the cover; drag photos or use the arrows to change the order.
        {isNew && pending.length ? " Photos upload when you save the product." : ""}
      </p>

      {deleting ? (
        <ConfirmDialog
          title="Remove this photo?"
          message="The photo is deleted from the website and the server."
          confirmLabel="Remove photo"
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
