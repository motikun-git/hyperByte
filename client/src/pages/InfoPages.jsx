// Text pages whose content is edited in Admin > Settings: warranty policy,
// pre-order information, about, and the custom PC build inquiry.
import { useState } from "react";
import { Link } from "../lib/router.jsx";
import { useApi } from "../lib/useApi.js";
import { usePageMeta } from "../lib/usePageMeta.js";
import { useSettings } from "../context/SettingsContext.jsx";
import { facebookChat, mapLink, whatsappLink, mainWhatsapp } from "../lib/contact.js";
import { SectionHeading } from "../components/effects/Kinetic.jsx";
import ProductGrid from "../components/product/ProductGrid.jsx";
import Prose from "../components/ui/Prose.jsx";
import Icon from "../components/ui/Icon.jsx";
import PartsBuilder from "../components/order/PartsBuilder.jsx";

function InfoLayout({ title, lede, children, aside = null }) {
  return (
    <div className="container page info-page">
      <header className="page-head">
        <SectionHeading as="h1" text={title} />
        {lede ? <p className="lede">{lede}</p> : null}
      </header>
      <div className={`info-page__grid${aside ? " has-aside" : ""}`}>
        <div className="info-page__main">{children}</div>
        {aside ? <aside className="info-page__aside">{aside}</aside> : null}
      </div>
    </div>
  );
}

function ContactCard({ message, title = "Questions?", text = "Message us. We usually reply the same day." }) {
  const { settings } = useSettings();
  const wa = whatsappLink(mainWhatsapp(settings), message);
  const fb = facebookChat(settings);
  return (
    <div className="panel info-card">
      <h2 className="h3">{title}</h2>
      <p className="muted small">{text}</p>
      <div className="stack" style={{ "--gap": "10px" }}>
        {wa ? (
          <a className="btn btn--whatsapp btn--block" href={wa} target="_blank" rel="noopener noreferrer" data-pulse>
            <Icon name="whatsapp" size={19} /> WhatsApp
          </a>
        ) : null}
        {fb ? (
          <a className="btn btn--facebook btn--block" href={fb} target="_blank" rel="noopener noreferrer" data-pulse>
            <Icon name="facebook" size={19} /> Facebook
          </a>
        ) : null}
        {settings.instagramUrl ? (
          <a className="btn btn--ghost btn--block" href={settings.instagramUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="instagram" size={18} /> Instagram
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function WarrantyPolicy() {
  const { settings } = useSettings();
  usePageMeta(`Warranty policy | ${settings.siteName}`, "What the hyperByte warranty covers, how the period is calculated and how to make a claim.");
  return (
    <InfoLayout
      title="Warranty policy"
      lede="How warranties work for items bought from hyperByte."
      aside={
        <>
          <div className="panel info-card">
            <h2 className="h3">Check a warranty</h2>
            <p className="muted small">Enter the code from your receipt to see the end date and the time left.</p>
            <Link to="/warranty" className="btn btn--primary btn--block">
              <Icon name="shieldCheck" size={18} /> Warranty check
            </Link>
          </div>
          <ContactCard message="Hello hyperByte, I have a question about a warranty." title="Need to make a claim?" text="Message us with your warranty code and what is wrong." />
        </>
      }
    >
      {!settings.warrantyPolicyReviewed ? (
        <p className="notice notice--warn" role="note">
          <Icon name="info" size={18} /> This policy is being finalised. For the exact terms of your item, check the terms on your warranty code or ask us.
        </p>
      ) : null}
      <Prose text={settings.warrantyPolicy} className="info-prose" />
    </InfoLayout>
  );
}

export function PreorderInfo() {
  const { settings } = useSettings();
  usePageMeta(`Pre-order information | ${settings.siteName}`, "How pre-orders work at hyperByte. Nothing is confirmed until you agree, and no payment is taken on this website.");
  const pre = useApi("/products?status=preorder&limit=8");
  return (
    <InfoLayout
      title="Pre-order information"
      lede="Looking for something that is not in stock? We may be able to get it for you."
      aside={<ContactCard message="Hello hyperByte, I would like to pre-order an item. Can you help me find it?" title="Ask for an item" text="Tell us the exact model you want. We will check and get back to you." />}
    >
      <Prose text={settings.preorderInfo} className="info-prose" />
      {pre.data?.items?.length ? (
        <section className="info-page__products" aria-labelledby="pre-now">
          <div className="section-head">
            <h2 id="pre-now" className="h2">
              Open for pre-order now
            </h2>
            <Link className="btn btn--ghost btn--sm" to="/products?status=preorder">
              All pre-orders <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <ProductGrid items={pre.data.items} />
        </section>
      ) : null}
    </InfoLayout>
  );
}

export function About() {
  const { settings } = useSettings();
  usePageMeta(`About | ${settings.siteName}`, settings.metaDescription);
  const map = mapLink(settings);
  return (
    <InfoLayout
      title={`About ${settings.siteName}`}
      aside={
        <>
          <div className="panel info-card">
            <h2 className="h3">Visit or contact</h2>
            {settings.address ? (
              <p className="footer-line">
                <Icon name="mapPin" size={17} />
                {map ? (
                  <a href={map} target="_blank" rel="noopener noreferrer">
                    {settings.address}
                  </a>
                ) : (
                  settings.address
                )}
              </p>
            ) : null}
            {settings.hours ? (
              <p className="footer-line">
                <Icon name="clock" size={17} /> {settings.hours}
              </p>
            ) : null}
            {settings.phone ? (
              <a className="footer-line" href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
                <Icon name="phone" size={17} /> {settings.phone}
              </a>
            ) : null}
          </div>
          <ContactCard message="Hello hyperByte, I have a question." />
        </>
      }
    >
      <Prose text={settings.aboutText} className="info-prose" />
      <div className="row" style={{ "--gap": "10px", marginTop: 24 }}>
        <Link to="/products" className="btn btn--primary">
          Browse products <Icon name="arrowRight" size={17} className="icon-arrow" />
        </Link>
        <Link to="/warranty-policy" className="btn btn--ghost">
          Warranty policy
        </Link>
      </div>
    </InfoLayout>
  );
}

const BUILD_PARTS = [
  { key: "cpu", label: "CPU / Processor", icon: "cpu", placeholder: "AM5 or DDR5 platform, e.g. Ryzen 7 7700 or Core i5-14600K" },
  { key: "mobo", label: "Motherboard", icon: "motherboard", placeholder: "AM5 or DDR5 board, e.g. ASRock B650M or MSI B760 DDR5" },
  { key: "ram", label: "RAM", icon: "ram", placeholder: "DDR5 only, e.g. 32GB (2x16) DDR5 6000" },
  { key: "gpu", label: "GPU", icon: "gpu", placeholder: "e.g. RTX 4070 Super 12GB" },
  { key: "storage", label: "Storage (SSD)", icon: "storage", placeholder: "e.g. 1TB NVMe Gen4 SSD" },
  { key: "cooler", label: "CPU cooler", icon: "fan", placeholder: "e.g. DeepCool AK620 or 240mm AIO" },
  { key: "psu", label: "PSU", icon: "psu", placeholder: "Minimum 850W, e.g. Corsair RM850e 850W Gold" },
  { key: "casing", label: "Casing", icon: "case", placeholder: "We currently do not bring casings" },
  { key: "monitor", label: "Monitor", icon: "monitor", placeholder: "We currently do not bring monitors" },
];

export function CustomPc() {
  const { settings } = useSettings();
  usePageMeta(`Custom PC build | ${settings.siteName}`, "Plan an AM5 or DDR5 PC with hyperByte: choose your components, pre-owned or new, add your budget and send the list on WhatsApp or Facebook.");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="container page preorder-page">
      <header className="page-head">
        <SectionHeading as="h1" text="Custom PC build" />
        <p className="lede">Choose the components for your PC, pre-owned or new, and add your budget. We check compatibility and confirm the price and arrival time with you in the chat.</p>
      </header>

      <p className="build-note panel" role="note">
        <Icon name="info" size={19} />
        <span>
          Custom builds are available for <strong>AM5</strong> or <strong>DDR5</strong> builds only. We currently do not bring monitors or casings.
        </span>
      </p>

      <PartsBuilder
        id="build"
        title="Choose your components"
        hint="Fill in what you already know. Leave a part empty if you want our suggestion for it."
        parts={BUILD_PARTS}
        intro="Hello hyperByte, I want a custom PC build (AM5 / DDR5) with the component"
        extra={[budget.trim() ? `Budget: ${budget.trim()}` : "", notes.trim() ? `Notes: ${notes.trim()}` : ""]}
      >
        <div className="build-budget">
          <label className="field">
            <span className="field__label">
              <Icon name="wallet" size={17} /> Budget
            </span>
            <input className="input" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Keep your budget realistic for the components you selected, e.g. 1,50,000 taka" maxLength={80} inputMode="text" />
          </label>
          <label className="field">
            <span className="field__label">
              Anything else <span className="faint">(optional)</span>
            </span>
            <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Main use (gaming, editing...), parts you already have, colour wishes..." maxLength={600} />
          </label>
        </div>
      </PartsBuilder>
    </div>
  );
}
