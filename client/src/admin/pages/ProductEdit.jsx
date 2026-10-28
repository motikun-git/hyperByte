import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "../../lib/router.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { ConfirmDialog } from "../../components/ui/Modal.jsx";
import ProductCard from "../../components/product/ProductCard.jsx";
import { CONDITIONS, STATUSES } from "../../lib/constants.js";
import { dateTime, taka } from "../../lib/format.js";
import { adminApi, uploadFile } from "../adminApi.js";
import PhotoManager from "../components/PhotoManager.jsx";
import { Busy, Field, LoadError, PageHead, Switch, useAdminApi, useDocTitle, useUnsavedWarning } from "../ui.jsx";

let rowId = 0;
const newRow = (key = "", value = "") => ({ id: `r${(rowId += 1)}`, key, value });

const EMPTY = {
  name: "",
  categoryId: "",
  subcategoryId: "",
  brand: "",
  model: "",
  sku: "",
  price: "",
  originalPrice: "",
  condition: "",
  conditionNote: "",
  status: "available",
  expectedAvailability: "",
  stockRef: "",
  isPublished: true,
  isFeatured: false,
  warrantyInfo: "",
  warrantyDays: "",
  description: "",
};

function formFrom(p) {
  return {
    name: p.name || "",
    categoryId: p.categoryId ? String(p.categoryId) : "",
    subcategoryId: p.subcategoryId ? String(p.subcategoryId) : "",
    brand: p.brand || "",
    model: p.model || "",
    sku: p.sku || "",
    price: p.price === null || p.price === undefined ? "" : String(p.price),
    originalPrice: p.originalPrice === null || p.originalPrice === undefined ? "" : String(p.originalPrice),
    condition: p.condition || "",
    conditionNote: p.conditionNote || "",
    status: p.status || "available",
    expectedAvailability: p.expectedAvailability || "",
    stockRef: p.stockRef || "",
    isPublished: Boolean(p.isPublished),
    isFeatured: Boolean(p.isFeatured),
    warrantyInfo: p.warrantyInfo || "",
    warrantyDays: p.warrantyDays === null || p.warrantyDays === undefined ? "" : String(p.warrantyDays),
    description: p.description || "",
  };
}

const digits = (v) => String(v).replace(/[^\d]/g, "");
const cleanSpecs = (rows) => rows.filter((r) => r.key.trim() && r.value.trim()).map((r) => ({ key: r.key.trim(), value: r.value.trim() }));

export default function ProductEdit({ id }) {
  const isNew = id === null;
  const navigate = useNavigate();
  const toast = useToast();
  const loaded = useAdminApi(isNew ? null : `/admin/products/${id}`);
  const cats = useAdminApi("/admin/categories");
  const allCategories = cats.data?.categories || [];
  const categories = allCategories.filter((c) => c.parentId === null);

  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [specs, setSpecs] = useState([]);
  const [initial, setInitial] = useState(() => JSON.stringify({ form: EMPTY, specs: [] }));
  const [pending, setPending] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const topRef = useRef(null);

  useDocTitle(isNew ? "Add product" : form.name || "Edit product");

  // Fill the form once the product has loaded.
  useEffect(() => {
    if (!loaded.data?.product) return;
    const p = loaded.data.product;
    const f = formFrom(p);
    const rows = (p.specs || []).map((s) => newRow(s.key, s.value));
    setProduct(p);
    setForm(f);
    setSpecs(rows);
    setInitial(JSON.stringify({ form: f, specs: cleanSpecs(rows) }));
  }, [loaded.data]);

  const dirty = JSON.stringify({ form, specs: cleanSpecs(specs) }) !== initial || pending.length > 0;
  useUnsavedWarning(dirty && !saving);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const category = categories.find((c) => String(c.id) === form.categoryId);
  const subcategories = allCategories.filter((c) => c.parentId !== null && String(c.parentId) === form.categoryId);
  const subcategory = subcategories.find((c) => String(c.id) === form.subcategoryId);

  const chooseCategory = (value) => {
    setForm((f) => ({ ...f, categoryId: value, subcategoryId: "" }));
    if (errors.categoryId) setErrors((e) => ({ ...e, categoryId: undefined }));
    const next = categories.find((c) => String(c.id) === value);
    // Start the specification list with the usual fields for this category.
    if (next?.specKeys?.length && specs.every((r) => !r.value.trim())) {
      setSpecs(next.specKeys.map((k) => newRow(k, "")));
    }
  };

  const price = form.price === "" ? null : Number(digits(form.price));
  const original = form.originalPrice === "" ? null : Number(digits(form.originalPrice));

  const previewProduct = useMemo(() => {
    const cover = isNew ? pending[0]?.preview : product?.images?.[0]?.thumb || product?.images?.[0]?.url;
    return {
      id: form.sku || product?.sku || "HB-NEW",
      slug: product?.slug || "preview",
      name: form.name || "Product name",
      brand: form.brand,
      model: form.model,
      category: category ? { name: category.name, slug: category.slug, icon: category.icon } : null,
      subcategory: subcategory ? { name: subcategory.name, slug: subcategory.slug } : null,
      price,
      originalPrice: original,
      discountPct: price !== null && original && original > price ? Math.round((1 - price / original) * 100) : 0,
      condition: form.condition,
      conditionLabel: CONDITIONS[form.condition]?.label || "",
      status: form.status,
      expectedAvailability: form.status === "preorder" ? form.expectedAvailability : "",
      isFeatured: form.isFeatured,
      image: cover ? { url: cover, thumb: cover } : null,
      imageCount: isNew ? pending.length : product?.images?.length || 0,
      specs: cleanSpecs(specs).slice(0, 3),
    };
  }, [form, specs, category, subcategory, pending, product, isNew, price, original]);

  const payload = () => ({
    ...form,
    categoryId: form.categoryId ? Number(form.categoryId) : null,
    subcategoryId: form.subcategoryId ? Number(form.subcategoryId) : null,
    price: form.price === "" ? null : digits(form.price),
    originalPrice: form.originalPrice === "" ? null : digits(form.originalPrice),
    warrantyDays: form.warrantyDays === "" ? null : digits(form.warrantyDays),
    sku: form.sku.trim(),
    specs: cleanSpecs(specs),
  });

  const save = async (e) => {
    e?.preventDefault();
    setErrors({});
    setSaving("Saving...");
    try {
      if (isNew) {
        const res = await adminApi("/admin/products", { method: "POST", body: payload() });
        const created = res.product;
        let failed = 0;
        for (let i = 0; i < pending.length; i += 1) {
          setSaving(`Uploading photo ${i + 1} of ${pending.length}...`);
          try {
            await uploadFile(`/admin/products/${created.dbId}/images`, "images", pending[i].file);
          } catch (err) {
            failed += 1;
            toast(`${pending[i].file.name}: ${err.message}`, "error");
          }
        }
        setPending([]);
        setInitial(JSON.stringify({ form, specs: cleanSpecs(specs) }));
        toast(failed ? `Saved ${created.name}, but ${failed} photo${failed === 1 ? "" : "s"} did not upload.` : `Saved ${created.name} (${created.sku})`, failed ? "error" : "success");
        navigate(`/admin/products/${created.dbId}`, { replace: true });
        return;
      }
      const res = await adminApi(`/admin/products/${id}`, { method: "PUT", body: payload() });
      const p = res.product;
      const f = formFrom(p);
      const rows = (p.specs || []).map((s) => newRow(s.key, s.value));
      setProduct(p);
      setForm(f);
      setSpecs(rows);
      setInitial(JSON.stringify({ form: f, specs: cleanSpecs(rows) }));
      toast(`Saved ${p.name}`);
    } catch (err) {
      setErrors(err.errors || {});
      toast(err.status === 422 ? "Please fix the marked fields." : err.message, "error");
      if (err.status === 422) topRef.current?.scrollIntoView({ block: "start" });
    } finally {
      setSaving("");
    }
  };

  const remove = async () => {
    setDeleteBusy(true);
    try {
      await adminApi(`/admin/products/${id}`, { method: "DELETE" });
      toast(`Deleted ${product.name}`);
      setInitial(JSON.stringify({ form, specs: cleanSpecs(specs) }));
      navigate("/admin/products", { replace: true });
    } catch (err) {
      toast(err.message, "error");
      setDeleteBusy(false);
    }
  };

  const leave = (e) => {
    if (dirty && !window.confirm("Leave without saving your changes?")) e.preventDefault();
  };

  if (!isNew && loaded.error && !loaded.data) {
    return (
      <>
        <PageHead title="Edit product" back={{ to: "/admin/products", label: "Products" }} />
        <LoadError error={loaded.error} onRetry={loaded.reload} />
      </>
    );
  }
  if (!isNew && !product) {
    return (
      <div className="stack" aria-busy="true">
        <div className="skeleton" style={{ height: 40, width: 260 }} />
        <div className="skeleton" style={{ height: 220 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  const viewHref = product ? (product.isPublished ? `/product/${product.slug}` : `/product/${product.slug}?preview=1`) : null;
  const errorList = Object.entries(errors).filter(([, v]) => v);

  return (
    <form onSubmit={save} noValidate>
      <div ref={topRef} />
      <PageHead
        title={isNew ? "Add product" : product.name}
        sub={isNew ? "Fill in what a buyer needs to decide. Only the name, category and condition are required." : `${product.sku} · added ${dateTime(product.createdAt)}`}
        back={{ to: "/admin/products", label: "Products", onClick: leave }}
        actions={
          !isNew ? (
            <>
              <a className="btn btn--ghost btn--sm" href={viewHref} target="_blank" rel="noopener noreferrer">
                <Icon name="eye" size={17} /> {product.isPublished ? "View on website" : "Preview"}
              </a>
              <Link className="btn btn--ghost btn--sm" to={`/admin/warranties/new?productId=${product.dbId}`}>
                <Icon name="shieldCheck" size={17} /> Create warranty
              </Link>
            </>
          ) : null
        }
      />

      {errorList.length ? (
        <div className="notice notice--error" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={18} />
          <div>
            <strong>Please fix these before saving:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {errorList.map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="a-editor">
        <div className="a-editor__main">
          <section className="a-card" aria-labelledby="ed-photos">
            <div className="a-card__head">
              <h2 id="ed-photos" className="a-card__title">
                Photos
              </h2>
              <span className="a-card__note">The first photo is the cover</span>
            </div>
            {!isNew && product.archivedImages?.length ? (
              <ArchivedPhotos product={product} onRestored={(p) => setProduct((old) => ({ ...old, images: p.images, archivedImages: p.archivedImages, updatedAt: p.updatedAt }))} />
            ) : null}
            <PhotoManager
              productId={isNew ? null : product.dbId}
              images={product?.images || []}
              onProductChange={(p) => setProduct((old) => ({ ...old, images: p.images, archivedImages: p.archivedImages, updatedAt: p.updatedAt }))}
              pending={pending}
              onPendingChange={setPending}
            />
          </section>

          <section className="a-card" aria-labelledby="ed-basics">
            <div className="a-card__head">
              <h2 id="ed-basics" className="a-card__title">
                Product
              </h2>
            </div>
            <div className="a-grid a-grid--2">
              <Field label="Name" error={errors.name} className="a-span-2" hint="As buyers would search for it, e.g. MSI GeForce RTX 3060 Ventus 2X 12G">
                {(p) => <input {...p} className="input" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={160} required />}
              </Field>
              <Field label="Category" error={errors.categoryId}>
                {(p) => (
                  <select {...p} className="select" value={form.categoryId} onChange={(e) => chooseCategory(e.target.value)} required>
                    <option value="">Choose a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.isActive ? "" : " (hidden)"}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {subcategories.length ? (
                <Field label="Subcategory" optional error={errors.subcategoryId}>
                  {(p) => (
                    <select {...p} className="select" value={form.subcategoryId} onChange={(e) => set("subcategoryId", e.target.value)}>
                      <option value="">None</option>
                      {subcategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.isActive ? "" : " (hidden)"}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : null}
              <Field label="Product ID" optional error={errors.sku} hint={isNew ? "Leave empty to get the next number, like HB-1024." : "Shown to buyers and used in WhatsApp messages."}>
                {(p) => <input {...p} className="input" value={form.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} maxLength={40} autoCapitalize="characters" spellCheck="false" />}
              </Field>
              <Field label="Brand" optional error={errors.brand}>
                {(p) => <input {...p} className="input" value={form.brand} onChange={(e) => set("brand", e.target.value)} maxLength={60} />}
              </Field>
              <Field label="Model" optional error={errors.model}>
                {(p) => <input {...p} className="input" value={form.model} onChange={(e) => set("model", e.target.value)} maxLength={100} />}
              </Field>
              <Field label="Stock note" optional error={errors.stockRef} hint="Private, only for you: where it is, supplier, serial number." className="a-span-2">
                {(p) => <input {...p} className="input" value={form.stockRef} onChange={(e) => set("stockRef", e.target.value)} maxLength={120} placeholder="e.g. Shelf B2, serial ends 4471" />}
              </Field>
            </div>
          </section>

          <section className="a-card" aria-labelledby="ed-price">
            <div className="a-card__head">
              <h2 id="ed-price" className="a-card__title">
                Price
              </h2>
              <span className="a-card__note">In taka</span>
            </div>
            <div className="a-grid a-grid--2">
              <Field label="Selling price" optional error={errors.price} hint={price === null ? 'Empty: the website shows "Contact for price".' : `Shown as ${taka(price)}`}>
                {(p) => <input {...p} className="input num" inputMode="numeric" placeholder="e.g. 25500" value={form.price} onChange={(e) => set("price", e.target.value)} />}
              </Field>
              <Field
                label="Original price"
                optional
                error={errors.originalPrice}
                hint={original && price !== null && original > price ? `Shows ${taka(original)} struck out and a -${Math.round((1 - price / original) * 100)}% badge.` : "The new-item price, to show the saving. Must be higher than the selling price."}
              >
                {(p) => <input {...p} className="input num" inputMode="numeric" placeholder="e.g. 36000" value={form.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} />}
              </Field>
            </div>
          </section>

          <section className="a-card" aria-labelledby="ed-condition">
            <div className="a-card__head">
              <h2 id="ed-condition" className="a-card__title">
                Condition
              </h2>
            </div>
            <div className="stack">
              <div>
                <div className="a-segment" role="group" aria-labelledby="ed-condition">
                  {Object.entries(CONDITIONS).map(([key, c]) => (
                    <button key={key} type="button" aria-pressed={form.condition === key} onClick={() => set("condition", key)}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="field__hint" style={{ marginTop: 8 }}>
                  {form.condition ? CONDITIONS[form.condition].hint : "Choose the grade that matches the item."}
                </p>
                {errors.condition ? <p className="field__error">{errors.condition}</p> : null}
              </div>
              <Field label="Condition notes" optional error={errors.conditionNote} hint="Marks, repairs, what was tested. Buyers trust honest notes.">
                {(p) => <input {...p} className="input" value={form.conditionNote} onChange={(e) => set("conditionNote", e.target.value)} maxLength={300} placeholder="e.g. Small scratch on the backplate, fans replaced" />}
              </Field>
            </div>
          </section>

          <section className="a-card" aria-labelledby="ed-specs">
            <div className="a-card__head">
              <h2 id="ed-specs" className="a-card__title">
                Specifications
              </h2>
              <span className="a-card__note">The first three also show on the product card</span>
            </div>
            <SpecsEditor rows={specs} onChange={setSpecs} suggestions={category?.specKeys || []} />
          </section>

          <section className="a-card" aria-labelledby="ed-desc">
            <div className="a-card__head">
              <h2 id="ed-desc" className="a-card__title">
                Description and warranty
              </h2>
            </div>
            <div className="stack">
              <Field label="Description" optional error={errors.description} hint="An empty line starts a new paragraph. Lines starting with - become a list.">
                {(p) => <textarea {...p} className="textarea" rows={7} value={form.description} onChange={(e) => set("description", e.target.value)} />}
              </Field>
              <div className="a-grid a-grid--2">
                <Field label="Warranty text" optional error={errors.warrantyInfo} hint="Shown on the product page.">
                  {(p) => <input {...p} className="input" value={form.warrantyInfo} onChange={(e) => set("warrantyInfo", e.target.value)} maxLength={200} placeholder="e.g. 15-day checking warranty" />}
                </Field>
                <Field label="Warranty length in days" optional error={errors.warrantyDays} hint="Used as the default when you create a warranty code for this item.">
                  {(p) => <input {...p} className="input num" inputMode="numeric" value={form.warrantyDays} onChange={(e) => set("warrantyDays", e.target.value)} placeholder="e.g. 15" />}
                </Field>
              </div>
            </div>
          </section>

          {!isNew ? (
            <section className="a-card" aria-labelledby="ed-danger">
              <div className="a-card__head">
                <h2 id="ed-danger" className="a-card__title">
                  Delete product
                </h2>
              </div>
              <p className="muted small" style={{ marginBottom: 12 }}>
                Sold it? Set it to Sold out instead: it stays as proof of sales under "Recently sold". Delete only mistakes and duplicates.
              </p>
              <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(true)}>
                <Icon name="trash" size={16} /> Delete this product
              </button>
            </section>
          ) : null}
        </div>

        <aside className="a-editor__aside stack">
          <section className="a-card" aria-labelledby="ed-visibility">
            <div className="a-card__head">
              <h2 id="ed-visibility" className="a-card__title">
                On the website
              </h2>
            </div>
            <div className="stack">
              <div>
                <p className="field__label" id="ed-status" style={{ marginBottom: 8 }}>
                  Availability
                </p>
                <div className="a-segment" role="group" aria-labelledby="ed-status">
                  {Object.entries(STATUSES).map(([key, s]) => (
                    <button key={key} type="button" aria-pressed={form.status === key} onClick={() => set("status", key)}>
                      {s.label}
                    </button>
                  ))}
                </div>
                {errors.status ? <p className="field__error">{errors.status}</p> : null}
                <p className="field__hint" style={{ marginTop: 8 }}>
                  {
                    {
                      available: "In stock and listed as available.",
                      preorder: "Not in stock yet. Buyers can send a pre-order inquiry.",
                      sold: "Shown under Recently sold with the cover photo blurred (if sold items are shown).",
                      unavailable: "Not for sale right now. Hidden from lists; its own link still works.",
                    }[form.status]
                  }
                </p>
              </div>
              {form.status === "preorder" ? (
                <Field label="Expected arrival" optional error={errors.expectedAvailability} hint="Only fill this in with a real estimate.">
                  {(p) => <input {...p} className="input" value={form.expectedAvailability} onChange={(e) => set("expectedAvailability", e.target.value)} maxLength={120} placeholder="e.g. Around mid-November" />}
                </Field>
              ) : null}
              <Switch checked={form.isPublished} onChange={(v) => set("isPublished", v)} label="Show on website" hint={form.isPublished ? "Visible to everyone." : "Hidden draft. Only you can preview it."} />
              <Switch checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} label="Feature on home page" hint="Shown in the Featured row (if available or pre-order)." />
            </div>
          </section>

          <section className="a-editor__preview" aria-label="Card preview">
            <p className="field__label" style={{ marginBottom: 8 }}>
              Card preview
            </p>
            <div className="a-preview" inert>
              <ProductCard product={previewProduct} />
            </div>
          </section>
        </aside>
      </div>

      <div className="a-savebar">
        <span className="a-savebar__note" aria-live="polite">
          {saving || (dirty ? "Unsaved changes" : isNew ? "" : `Saved. Last change ${dateTime(product.updatedAt)}`)}
        </span>
        <Link to="/admin/products" className="btn btn--ghost" onClick={leave}>
          Cancel
        </Link>
        <button type="submit" className="btn btn--primary" disabled={Boolean(saving)}>
          {saving ? <Busy /> : <Icon name="save" size={18} />} {isNew ? "Save product" : "Save changes"}
        </button>
      </div>

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${product.name}?`}
          message="The product and all its photos are removed for good. Warranty records for it are kept."
          confirmLabel="Delete product"
          busy={deleteBusy}
          onConfirm={remove}
          onCancel={() => setDeleting(false)}
        />
      ) : null}
    </form>
  );
}

function SpecsEditor({ rows, onChange, suggestions }) {
  const update = (id, key, value) => onChange(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  const move = (index, dir) => {
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    onChange(next);
  };
  const used = new Set(rows.map((r) => r.key.trim().toLowerCase()));
  const missing = suggestions.filter((k) => !used.has(k.toLowerCase()));

  return (
    <div className="stack" style={{ "--gap": "10px" }}>
      {rows.length ? (
        <div className="a-specs">
          {rows.map((r, i) => (
            <div key={r.id} className="a-spec">
              <input className="input" placeholder="Name, e.g. Memory" aria-label={`Specification ${i + 1} name`} value={r.key} onChange={(e) => update(r.id, "key", e.target.value)} maxLength={60} />
              <input className="input" placeholder="Value, e.g. 12 GB GDDR6" aria-label={`Specification ${i + 1} value`} value={r.value} onChange={(e) => update(r.id, "value", e.target.value)} maxLength={200} />
              <span className="a-spec__btns">
                <button type="button" className="a-iconbtn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <Icon name="arrowUp" size={15} />
                </button>
                <button type="button" className="a-iconbtn a-iconbtn--danger" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} aria-label={`Remove ${r.key || "this row"}`}>
                  <Icon name="x" size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="faint small">No specifications yet. Choose a category to get the usual fields, or add rows.</p>
      )}
      <div className="row" style={{ "--gap": "8px" }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange([...rows, newRow()])}>
          <Icon name="plus" size={16} /> Add row
        </button>
      </div>
      {missing.length ? (
        <div className="a-suggest">
          <span className="faint small">Usual for this category:</span>
          {missing.map((k) => (
            <button key={k} type="button" className="chip" onClick={() => onChange([...rows, newRow(k, "")])}>
              <Icon name="plus" size={13} /> {k}
            </button>
          ))}
        </div>
      ) : null}
      <p className="field__hint">Empty rows are not saved.</p>
    </div>
  );
}

function ArchivedPhotos({ product, onRestored }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const n = product.archivedImages.length;
  const restore = async () => {
    setBusy(true);
    try {
      const res = await adminApi(`/admin/products/${product.dbId}/images/restore`, { method: "POST" });
      onRestored(res.product);
      toast(res.restored ? `Restored ${res.restored} photo${res.restored === 1 ? "" : "s"}` : "No photos could be restored", res.restored ? "success" : "error");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="notice" style={{ marginBottom: 12 }}>
      <Icon name="archive" size={18} />
      <div className="stack" style={{ "--gap": "8px" }}>
        <span>
          {n} more photo{n === 1 ? " was" : "s were"} archived when this item was sold, to save space. Archived photos are private and are deleted after the period set in Settings.
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={restore} disabled={busy} style={{ justifySelf: "start" }}>
          {busy ? <Busy /> : <Icon name="rotateCcw" size={16} />} Restore archived photos
        </button>
      </div>
    </div>
  );
}
