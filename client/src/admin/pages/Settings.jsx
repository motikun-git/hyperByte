import { useEffect, useRef, useState } from "react";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { whatsappLink } from "../../lib/contact.js";
import { adminApi, prepareImage, uploadFile } from "../adminApi.js";
import { Busy, Field, LoadError, PageHead, Switch, useAdminApi, useDocTitle, useUnsavedWarning } from "../ui.jsx";

const TEXT_KEYS = [
  "siteName", "tagline", "heroTitle", "heroText", "metaDescription",
  "whatsappNumber", "whatsappNumberCn", "facebookUrl", "messengerUrl", "instagramUrl", "youtubeUrl", "tiktokUrl",
  "phone", "email", "address", "mapUrl", "hours",
  "warrantyTerms", "warrantyPolicy", "preorderPolicy", "aboutText", "customBuildMessage",
  "memoName", "memoAddress", "memoPhone", "memoFacebook", "memoSiteUrl",
];

function toForm(s) {
  const f = {};
  for (const k of TEXT_KEYS) f[k] = s[k] ?? "";
  f.heroPhrases = (s.heroPhrases || []).join("\n");
  f.showSoldProducts = Boolean(s.showSoldProducts);
  f.warrantyPolicyReviewed = Boolean(s.warrantyPolicyReviewed);
  f.soldPhotoPolicy = s.soldPhotoPolicy || "archive";
  f.soldPhotoRetentionDays = String(s.soldPhotoRetentionDays ?? 90);
  return f;
}

export default function SettingsPage() {
  useDocTitle("Settings");
  const toast = useToast();
  const { refresh } = useSettings();
  const { data, error, loading, reload, setData } = useAdminApi("/admin/settings");
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef(null);

  useEffect(() => {
    if (!data?.settings) return;
    const f = toForm(data.settings);
    setForm(f);
    setInitial(JSON.stringify(f));
  }, [data]);

  const dirty = form && JSON.stringify(form) !== initial;
  useUnsavedWarning(Boolean(dirty) && !saving);

  if (error && !data) return <LoadError error={error} onRetry={reload} />;
  if (loading || !form) return <div className="skeleton" style={{ height: 400 }} />;

  const set = (k) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [k]: value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const text = (k, label, props = {}) => (
    <Field label={label} optional={props.optional} hint={props.hint} error={errors[k]} className={props.className}>
      {(p) =>
        props.rows ? (
          <textarea {...p} className="textarea" rows={props.rows} value={form[k]} onChange={set(k)} />
        ) : (
          <input {...p} className="input" value={form[k]} onChange={set(k)} inputMode={props.inputMode} placeholder={props.placeholder} type={props.type || "text"} />
        )
      }
    </Field>
  );

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const body = { ...form, heroPhrases: form.heroPhrases.split("\n").map((x) => x.trim()).filter(Boolean), soldPhotoRetentionDays: form.soldPhotoRetentionDays };
    try {
      const res = await adminApi("/admin/settings", { method: "PUT", body });
      setData({ settings: res.settings });
      toast("Settings saved");
      refresh();
    } catch (err) {
      setErrors(err.errors || {});
      toast(err.status === 422 ? "Please fix the marked fields." : err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const prepared = await prepareImage(file, { maxSide: 800 });
      const res = await uploadFile("/admin/settings/logo", "logo", prepared);
      setData((d) => ({ settings: { ...d.settings, logoUrl: res.settings.logoUrl } }));
      toast("Logo updated");
      refresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLogoBusy(false);
    }
  };
  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      const res = await adminApi("/admin/settings/logo", { method: "DELETE" });
      setData((d) => ({ settings: { ...d.settings, logoUrl: res.settings.logoUrl } }));
      toast("Logo removed");
      refresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLogoBusy(false);
    }
  };

  const waTest = whatsappLink(form.whatsappNumber.replace(/\D/g, "").replace(/^01/, "8801"), "Test message from the hyperByte website settings.");

  return (
    <form onSubmit={save} noValidate>
      <PageHead title="Settings" sub="Contact details, home page text, page content and how sold products are shown." />

      <div className="stack">
        <section className="a-card" aria-labelledby="st-contact">
          <div className="a-card__head">
            <h2 id="st-contact" className="a-card__title">
              Contact and social links
            </h2>
            <span className="a-card__note">Buttons only appear for the details you fill in</span>
          </div>
          <div className="a-grid a-grid--2">
            {text("whatsappNumberCn", "WhatsApp number: Admin (CN)", { inputMode: "tel", placeholder: "86XXXXXXXXXXX", hint: "Required. With country code, like 8613812345678. Used by the WhatsApp buttons when the BD number is empty." })}
            <Field label="WhatsApp number: Admin (BD)" optional error={errors.whatsappNumber} hint="With country code, like 8801712345678 (01712345678 also works). If set, the main WhatsApp buttons use this number.">
              {(p) => (
                <div className="row" style={{ "--gap": "8px", flexWrap: "nowrap" }}>
                  <input {...p} className="input" inputMode="tel" value={form.whatsappNumber} onChange={set("whatsappNumber")} placeholder="8801XXXXXXXXX" />
                  {waTest && form.whatsappNumber ? (
                    <a className="a-iconbtn" href={waTest} target="_blank" rel="noopener noreferrer" title="Test this number" aria-label="Test the WhatsApp number">
                      <Icon name="whatsapp" size={16} />
                    </a>
                  ) : null}
                </div>
              )}
            </Field>
            {text("facebookUrl", "Facebook Page link", { optional: true, hint: "The full link, starting with https://" })}
            {text("messengerUrl", "Facebook Page message link", { optional: true, hint: "Like https://m.me/hyperByteCn. Facebook buttons open your Page's message box with this link." })}
            {text("instagramUrl", "Instagram link", { optional: true })}
            {text("youtubeUrl", "YouTube link", { optional: true })}
            {text("tiktokUrl", "TikTok link", { optional: true })}
            {text("phone", "Phone", { optional: true, inputMode: "tel" })}
            {text("email", "Email", { optional: true, type: "email" })}
            {text("address", "Address", { optional: true })}
            {text("mapUrl", "Google Maps link", { optional: true, hint: "Opened by the address on the website. Empty: a map search for the address is used." })}
            {text("hours", "Opening hours", { optional: true, placeholder: "e.g. Every day, 11am to 9pm" })}
          </div>
        </section>

        <section className="a-card" aria-labelledby="st-memo">
          <div className="a-card__head">
            <h2 id="st-memo" className="a-card__title">
              Sales memo
            </h2>
            <span className="a-card__note">Printed at the bottom of every memo</span>
          </div>
          <div className="a-grid a-grid--2">
            {text("memoName", "Name on the memo")}
            {text("memoPhone", "Phone on the memo")}
            {text("memoAddress", "Address on the memo")}
            {text("memoFacebook", "Facebook on the memo", { optional: true })}
            {text("memoSiteUrl", "Website address", { hint: "Used for the QR code and the warranty check line on the memo." })}
          </div>
        </section>

        <section className="a-card" aria-labelledby="st-home">
          <div className="a-card__head">
            <h2 id="st-home" className="a-card__title">
              Home page and search engines
            </h2>
          </div>
          <div className="a-grid a-grid--2">
            {text("siteName", "Shop name")}
            {text("tagline", "Tagline", { optional: true })}
            {text("heroTitle", "Big headline", { className: "a-span-2" })}
            {text("heroPhrases", "Rotating lines under the headline", { rows: 4, hint: "One per line.", className: "a-span-2" })}
            {text("heroText", "Short introduction", { rows: 3, className: "a-span-2" })}
            {text("metaDescription", "Description for Google and Facebook previews", { rows: 2, className: "a-span-2" })}
          </div>
        </section>

        <section className="a-card" aria-labelledby="st-logo">
          <div className="a-card__head">
            <h2 id="st-logo" className="a-card__title">
              Logo
            </h2>
            <span className="a-card__note">Optional. Without a logo, the hyperByte mark and name are shown.</span>
          </div>
          <div className="row" style={{ "--gap": "14px", alignItems: "center" }}>
            <div className="a-logo-preview" style={{ minWidth: 180 }}>
              {data.settings.logoUrl ? <img src={data.settings.logoUrl} alt="Current logo" /> : <span className="faint small">No logo uploaded</span>}
            </div>
            <div className="row" style={{ "--gap": "8px" }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => logoInput.current?.click()} disabled={logoBusy}>
                {logoBusy ? <Busy /> : <Icon name="upload" size={16} />} Upload logo
              </button>
              {data.settings.logoUrl ? (
                <button type="button" className="btn btn--danger btn--sm" onClick={removeLogo} disabled={logoBusy}>
                  <Icon name="trash" size={16} /> Remove
                </button>
              ) : null}
              <input ref={logoInput} type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={(e) => (uploadLogo(e.target.files?.[0]), (e.target.value = ""))} />
            </div>
          </div>
        </section>

        <section className="a-card" aria-labelledby="st-sold">
          <div className="a-card__head">
            <h2 id="st-sold" className="a-card__title">
              Sold products
            </h2>
          </div>
          <div className="stack">
            <Switch
              checked={form.showSoldProducts}
              onChange={set("showSoldProducts")}
              label="Show sold products on the website"
              hint="Sold items appear with the cover photo blurred and a SOLD stamp, under Recently sold. It shows buyers that stock moves."
            />
            <div className="field">
              <span className="field__label" id="st-photos">
                Photos of sold products
              </span>
              <div className="stack" style={{ "--gap": "8px" }} role="radiogroup" aria-labelledby="st-photos">
                <label className="check">
                  <input type="radio" name="soldPhotoPolicy" checked={form.soldPhotoPolicy === "archive"} onChange={() => set("soldPhotoPolicy")("archive")} />
                  Keep the cover photo, move the other photos to a private archive (saves space)
                </label>
                <label className="check">
                  <input type="radio" name="soldPhotoPolicy" checked={form.soldPhotoPolicy === "keep"} onChange={() => set("soldPhotoPolicy")("keep")} />
                  Keep all photos
                </label>
              </div>
              {errors.soldPhotoPolicy ? <p className="field__error">{errors.soldPhotoPolicy}</p> : null}
            </div>
            {form.soldPhotoPolicy === "archive" ? (
              <Field
                label="Delete archived photos after (days)"
                error={errors.soldPhotoRetentionDays}
                hint="Archived photos stay private and can be restored from the product page until then, in case of a warranty question. 0 = never delete. Putting a product back on sale restores its photos."
              >
                {(p) => <input {...p} className="input num" inputMode="numeric" style={{ maxWidth: 160 }} value={form.soldPhotoRetentionDays} onChange={(e) => set("soldPhotoRetentionDays")(e.target.value.replace(/\D/g, ""))} />}
              </Field>
            ) : null}
          </div>
        </section>

        <section className="a-card" aria-labelledby="st-pages">
          <div className="a-card__head">
            <h2 id="st-pages" className="a-card__title">
              Page content
            </h2>
            <span className="a-card__note">"## " starts a heading, "- " a bullet, "1. " a numbered step</span>
          </div>
          <div className="stack">
            {!form.warrantyPolicyReviewed ? (
              <p className="notice notice--warn">
                <Icon name="alert" size={18} /> The warranty policy below is a draft written for you. Change it to match your real policy before relying on it; the website shows it as a draft until you tick the box.
              </p>
            ) : null}
            {text("warrantyPolicy", "Warranty policy (page /warranty-policy)", { rows: 14 })}
            <Switch checked={form.warrantyPolicyReviewed} onChange={set("warrantyPolicyReviewed")} label="I have checked this policy and it is correct" />
            {text("warrantyTerms", "Default terms for new warranty codes", { rows: 5, hint: "Copied into each new warranty; shown on the warranty check page." })}
            {text("preorderPolicy", "Pre-order policy (page /pre-order)", { rows: 8 })}
            {text("aboutText", "About hyperByte (page /about)", { rows: 5 })}
            {text("customBuildMessage", "WhatsApp message for custom PC builds", { rows: 2 })}
          </div>
        </section>
      </div>

      <div className="a-savebar">
        <span className="a-savebar__note">{dirty ? "Unsaved changes" : ""}</span>
        <button type="submit" className="btn btn--primary" disabled={saving || !dirty}>
          {saving ? <Busy /> : <Icon name="save" size={18} />} Save settings
        </button>
      </div>
    </form>
  );
}
