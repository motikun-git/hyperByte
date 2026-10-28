import { useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import Icon, { CategoryIcon } from "../../components/ui/Icon.jsx";
import Modal, { ConfirmDialog } from "../../components/ui/Modal.jsx";
import { CATEGORY_ICONS } from "../../lib/constants.js";
import { adminApi } from "../adminApi.js";
import { Busy, Empty, Field, LoadError, PageHead, Switch, useAdminApi, useDocTitle } from "../ui.jsx";

export default function Categories() {
  useDocTitle("Categories");
  const toast = useToast();
  const { data, error, loading, reload } = useAdminApi("/admin/categories");
  const [editing, setEditing] = useState(null); // null | { parentId } for new | category
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const categories = data?.categories || [];
  const top = categories.filter((c) => c.parentId === null);

  const toggle = async (c) => {
    try {
      await adminApi(`/admin/categories/${c.id}`, { method: "PUT", body: { ...c, isActive: !c.isActive } });
      toast(c.isActive ? `${c.name} is hidden` : `${c.name} is shown`);
      reload();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <>
      <PageHead
        title="Categories"
        sub="Main categories and their subcategories, as shown in the menu and filters. Hidden ones stay usable in the admin panel."
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing({ parentId: null })}>
            <Icon name="plus" size={17} /> Add category
          </button>
        }
      />
      {error && !data ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : top.length ? (
        <section className="a-card">
          <ul className="a-list" role="list">
            {categories.map((c) => (
              <li key={c.id} className="a-item a-catrow" style={c.parentId ? { paddingLeft: 28 } : undefined}>
                <span className="a-caticon" style={c.parentId ? { width: 34, height: 34, opacity: 0.8 } : undefined}>
                  <CategoryIcon type={c.icon} size={c.parentId ? 17 : 20} strokeWidth={1.6} />
                </span>
                <span className="a-item__main">
                  <span className="a-item__title" style={c.isActive ? undefined : { color: "var(--text-3)" }}>
                    {c.name}
                  </span>
                  <span className="a-item__meta">
                    <span>/{c.slug}</span>
                    <span>
                      {c.productCount} product{c.productCount === 1 ? "" : "s"}
                    </span>
                    {!c.isActive ? <span className="badge">Hidden</span> : null}
                    {c.specKeys?.length ? <span>Specs: {c.specKeys.slice(0, 4).join(", ")}{c.specKeys.length > 4 ? "..." : ""}</span> : null}
                  </span>
                </span>
                <span className="a-pcontrols">
                  {!c.parentId ? (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ parentId: c.id })}>
                      <Icon name="plus" size={15} /> Subcategory
                    </button>
                  ) : null}
                  <button type="button" className="a-iconbtn" onClick={() => toggle(c)} aria-label={c.isActive ? `Hide ${c.name}` : `Show ${c.name}`} title={c.isActive ? "Hide" : "Show"}>
                    <Icon name={c.isActive ? "eye" : "eyeOff"} size={16} />
                  </button>
                  <button type="button" className="a-iconbtn" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                    <Icon name="pencil" size={16} />
                  </button>
                  <button type="button" className="a-iconbtn a-iconbtn--danger" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Empty icon="tags" title="No categories" text="Add the kinds of products you sell." />
      )}

      {editing ? (
        <CategoryDialog
          initial={editing.id ? editing : null}
          parentId={editing.id ? editing.parentId : editing.parentId}
          parents={top}
          onClose={() => setEditing(null)}
          onSaved={(c, isNew) => {
            setEditing(null);
            toast(isNew ? `Added ${c.name}` : `Saved ${c.name}`);
            reload();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message={deleting.productCount ? `${deleting.productCount} product(s) use this category, so it cannot be deleted. Move them first, or hide the category instead.` : "The category is removed. This cannot be undone."}
          confirmLabel="Delete category"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await adminApi(`/admin/categories/${deleting.id}`, { method: "DELETE" });
              toast(`Deleted ${deleting.name}`);
              setDeleting(null);
              reload();
            } catch (err) {
              toast(err.message, "error");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function CategoryDialog({ initial, parentId, parents, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    slug: initial?.slug || "",
    parentId: parentId ?? null,
    icon: initial?.icon || parents.find((p) => p.id === parentId)?.icon || "other",
    description: initial?.description || "",
    specKeys: (initial?.specKeys || []).join("\n"),
    sortOrder: initial?.sortOrder ?? "",
    isActive: initial ? initial.isActive : true,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const isSub = form.parentId !== null && form.parentId !== "";

  const save = async () => {
    setBusy(true);
    setErrors({});
    const body = { ...form, parentId: isSub ? Number(form.parentId) : null, sortOrder: form.sortOrder === "" ? 0 : Number(form.sortOrder) };
    try {
      const res = initial ? await adminApi(`/admin/categories/${initial.id}`, { method: "PUT", body }) : await adminApi("/admin/categories", { method: "POST", body });
      onSaved(res.category, !initial);
    } catch (err) {
      setErrors(err.errors || { name: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial ? `Edit ${initial.name}` : isSub ? "Add subcategory" : "Add category"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? <Busy /> : <Icon name="save" size={17} />} Save
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} />}
        </Field>
        <Field label="Main category" optional error={errors.parentId} hint="Choose one to make this a subcategory.">
          {(p) => (
            <select {...p} className="select" value={form.parentId ?? ""} onChange={(e) => setForm({ ...form, parentId: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">None (this is a main category)</option>
              {parents
                .filter((x) => x.id !== initial?.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label="Link name" optional error={errors.slug} hint={`Used in links, like /products?category=${form.slug || "gpu"}. Made from the name if empty.`}>
          {(p) => <input {...p} className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} maxLength={80} spellCheck="false" />}
        </Field>
        <div className="field">
          <span className="field__label" id="cat-icon">
            Icon
          </span>
          <div className="a-iconpick" role="group" aria-labelledby="cat-icon">
            {CATEGORY_ICONS.map((icon) => (
              <button key={icon} type="button" aria-pressed={form.icon === icon} onClick={() => setForm({ ...form, icon })} aria-label={icon} title={icon}>
                <CategoryIcon type={icon} size={20} strokeWidth={1.6} />
              </button>
            ))}
          </div>
        </div>
        {!isSub ? (
          <>
            <Field label="Short description" optional hint="Shown at the top of the category on the products page.">
              {(p) => <input {...p} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} />}
            </Field>
            <Field label="Specification fields" optional hint="One per line, in the order buyers should see them. New products in this category start with these fields.">
              {(p) => <textarea {...p} className="textarea" rows={5} value={form.specKeys} onChange={(e) => setForm({ ...form, specKeys: e.target.value })} />}
            </Field>
          </>
        ) : null}
        <Field label="Position" optional hint="Lower numbers come first.">
          {(p) => <input {...p} className="input num" inputMode="numeric" style={{ maxWidth: 140 }} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value.replace(/[^\d-]/g, "") })} />}
        </Field>
        <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Show on the website" />
      </div>
    </Modal>
  );
}
