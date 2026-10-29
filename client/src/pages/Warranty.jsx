import { useSearchParams } from "../lib/router.jsx";
import { usePageMeta } from "../lib/usePageMeta.js";
import { useSettings } from "../context/SettingsContext.jsx";
import { generalMessage, whatsappLink, mainWhatsapp } from "../lib/contact.js";
import { SectionHeading } from "../components/effects/Kinetic.jsx";
import WarrantyChecker from "../components/warranty/WarrantyChecker.jsx";
import Icon from "../components/ui/Icon.jsx";

export default function Warranty() {
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const code = params.get("code") || "";
  usePageMeta(`Warranty check | ${settings.siteName}`, "Enter your hyperByte warranty code to see the product, the warranty period and the time left.");
  const wa = whatsappLink(mainWhatsapp(settings), `${generalMessage} It is about my warranty.`);

  return (
    <div className="container page warranty-page">
      <header className="page-head">
        <SectionHeading as="h1" text="Warranty check" />
        <p className="lede">Enter the code from your receipt to see which product it covers, when the warranty ends and how much time is left.</p>
      </header>

      <div className="warranty-layout">
      <WarrantyChecker initialCode={code} onCodeChange={(c) => setParams({ code: c })} />

      <aside className="warranty-help" aria-label="Warranty help">
        <div className="warranty-help__item">
          <Icon name="receipt" size={22} strokeWidth={1.6} />
          <div>
            <h2 className="h3">Where is my code?</h2>
            <p className="muted small">It starts with HBW and is written on your receipt or in the message we sent when you bought the item.</p>
          </div>
        </div>
        <div className="warranty-help__item">
          <Icon name="wrench" size={22} strokeWidth={1.6} />
          <div>
            <h2 className="h3">Need to make a claim?</h2>
            <p className="muted small">Bring the item and your code to hyperByte, or message us first so we can help faster.</p>
            {wa ? (
              <a className="btn btn--whatsapp btn--sm" href={wa} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={17} /> Message us
              </a>
            ) : null}
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
}
