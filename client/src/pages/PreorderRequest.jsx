// The pre-order page: the parts builder, products already listed for
// pre-order, how pre-orders work and the pre-order policy.
import { useState } from "react";
import { Link } from "../lib/router.jsx";
import { useApi } from "../lib/useApi.js";
import { usePageMeta } from "../lib/usePageMeta.js";
import { useSettings } from "../context/SettingsContext.jsx";
import { SectionHeading } from "../components/effects/Kinetic.jsx";
import ProductGrid from "../components/product/ProductGrid.jsx";
import Prose from "../components/ui/Prose.jsx";
import Icon from "../components/ui/Icon.jsx";
import PartsBuilder from "../components/order/PartsBuilder.jsx";

const PARTS = [
  { key: "gpu", label: "GPU", icon: "gpu", placeholder: "e.g. RTX 4070 Super 12GB" },
  { key: "ram", label: "RAM", icon: "ram", placeholder: "e.g. Corsair Vengeance DDR5 6000 CL36 32GB" },
  { key: "cpu", label: "CPU / Processor", icon: "cpu", placeholder: "e.g. AMD Ryzen 7 7800X3D" },
  { key: "mobo", label: "Motherboard", icon: "motherboard", placeholder: "e.g. ASRock B650M (AM5)" },
  { key: "psu", label: "PSU", icon: "psu", placeholder: "Minimum 850W, e.g. Corsair RM850e 850W Gold" },
  { key: "cooler", label: "CPU cooler", icon: "fan", placeholder: "e.g. DeepCool AK620 or 240mm AIO" },
  { key: "other", label: "Others", icon: "other", placeholder: "e.g. 1TB NVMe SSD, keyboard, mouse" },
  { key: "laptop", label: "Laptop", icon: "laptop", placeholder: "e.g. Lenovo Legion 5, RTX 4060" },
];

export default function PreorderRequest() {
  const { settings } = useSettings();
  usePageMeta(
    `Pre-order | ${settings.siteName}`,
    "Pre-order pre-owned or new PC parts and laptops through hyperByte: list what you want, get a ready message, and send it on WhatsApp or Facebook."
  );
  const [policyOpen, setPolicyOpen] = useState(false);
  const pre = useApi("/products?status=preorder&limit=8");

  const openPolicy = () => {
    setPolicyOpen(true);
    window.setTimeout(() => document.querySelector(".pre-policy")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  return (
    <div className="container page preorder-page">
      <header className="page-head">
        <SectionHeading as="h1" text="Pre-order" />
        <p className="lede">
          Tell us exactly what you want, pre-owned or new. We source it for you and confirm the price and arrival time in the chat. Nothing is ordered or paid on this website.
        </p>
      </header>

      <PartsBuilder
        id="preorder"
        title="What do you want to pre-order?"
        hint="Fill in only what you need. Write the model and the details that matter (speed, size, wattage...)."
        parts={PARTS}
        intro="Hello hyperByte, I want to pre-order the product"
        agreement={(close) => (
          <p className="faint small">
            By sending a pre-order you agree to our{" "}
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                close();
                openPolicy();
              }}
            >
              pre-order policy
            </button>
            .
          </p>
        )}
      />

      {pre.data?.items?.length ? (
        <section className="info-page__products" aria-labelledby="pre-now">
          <div className="section-head">
            <h2 id="pre-now" className="h2">
              Already listed for pre-order
            </h2>
            <Link className="btn btn--ghost btn--sm" to="/products?status=preorder">
              See all <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <ProductGrid items={pre.data.items} />
        </section>
      ) : null}

      {settings.preorderPolicy ? (
        <section className="pre-info" aria-label="Pre-order policy">
          {settings.preorderPolicy ? (
            <details className="pre-policy panel" open={policyOpen} onToggle={(e) => setPolicyOpen(e.currentTarget.open)}>
              <summary>
                <Icon name="fileText" size={19} /> Pre-order policy
                <Icon name="chevronDown" size={18} className="pre-policy__chev" />
              </summary>
              <Prose text={settings.preorderPolicy} className="info-prose" />
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
