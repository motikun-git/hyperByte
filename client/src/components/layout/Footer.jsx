import { Link } from "../../lib/router.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useApi } from "../../lib/useApi.js";
import { facebookChat, generalMessage, mapLink, whatsappLink, mainWhatsapp } from "../../lib/contact.js";
import Icon from "../ui/Icon.jsx";
import Logo from "./Logo.jsx";
import MotionToggle from "./MotionToggle.jsx";

export default function Footer() {
  const { settings } = useSettings();
  const { data } = useApi("/categories");
  const wa = whatsappLink(mainWhatsapp(settings), generalMessage);
  const fb = settings.facebookUrl;
  const chat = facebookChat(settings);
  const map = mapLink(settings);
  const socials = [
    ["youtube", settings.youtubeUrl, "YouTube"],
    ["instagram", settings.instagramUrl, "Instagram"],
    ["tiktok", settings.tiktokUrl, "TikTok"],
  ].filter(([, url]) => url);

  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__brand">
          <Link to="/" className="brand" aria-label={`${settings.siteName} home`}>
            <Logo />
          </Link>
          <p className="muted small">{settings.tagline}. Every listing shows real photos, the condition and the specs of the actual item.</p>
          {settings.address ? (
            <p className="footer-line small">
              <Icon name="mapPin" size={16} />
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
            <p className="footer-line small">
              <Icon name="clock" size={16} /> {settings.hours}
            </p>
          ) : null}
        </div>

        <nav className="site-footer__col site-footer__cats" aria-label="Categories">
          <h2 className="site-footer__title">Categories</h2>
          <ul role="list">
            {(data?.categories || []).map((c) => (
              <li key={c.slug}>
                <Link to={`/products?category=${encodeURIComponent(c.slug)}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="site-footer__col" aria-label="Pages">
          <h2 className="site-footer__title">Help</h2>
          <ul role="list">
            <li>
              <Link to="/products">All products</Link>
            </li>
            <li>
              <Link to="/products?status=preorder">Pre-order products</Link>
            </li>
            <li>
              <Link to="/warranty">Warranty check</Link>
            </li>
            <li>
              <Link to="/warranty-policy">Warranty policy</Link>
            </li>
            <li>
              <Link to="/pre-order">Pre-order a part</Link>
            </li>
            <li>
              <Link to="/custom-pc">Custom PC build</Link>
            </li>
            <li>
              <Link to="/about">About</Link>
            </li>
            <li>
              <Link to="/#contact">Contact</Link>
            </li>
          </ul>
        </nav>

        <div className="site-footer__col">
          <h2 className="site-footer__title">Talk to us</h2>
          <div className="stack" style={{ "--gap": "10px" }}>
            {wa ? (
              <a className="btn btn--whatsapp btn--sm" href={wa} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={18} /> WhatsApp
              </a>
            ) : null}
            {fb || chat ? (
              <a className="btn btn--facebook btn--sm" href={fb || chat} target="_blank" rel="noopener noreferrer">
                <Icon name="facebook" size={18} /> Facebook Page
              </a>
            ) : null}
            {settings.phone ? (
              <a className="footer-line small" href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
                <Icon name="phone" size={16} /> {settings.phone}
              </a>
            ) : null}
            {settings.email ? (
              <a className="footer-line small" href={`mailto:${settings.email}`}>
                <Icon name="mail" size={16} /> {settings.email}
              </a>
            ) : null}
            {socials.length ? (
              <div className="row" style={{ "--gap": "8px" }}>
                {socials.map(([icon, url, label]) => (
                  <a key={icon} className="icon-btn" href={url} target="_blank" rel="noopener noreferrer" aria-label={label}>
                    <Icon name={icon} size={17} />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="container site-footer__bottom">
        <p className="faint tiny">
          © {new Date().getFullYear()} {settings.siteName}. All rights reserved.
        </p>
        <MotionToggle withLabel />
      </div>
    </footer>
  );
}
