import { Link } from "../lib/router.jsx";
import { usePageMeta } from "../lib/usePageMeta.js";
import Icon from "../components/ui/Icon.jsx";

export default function NotFound({ title = "This page drifted into a black hole", text = "The address may be wrong, or the page was moved." }) {
  usePageMeta("Not found | hyperByte");
  return (
    <div className="container page not-found">
      <div className="not-found__hole" aria-hidden="true">
        <span className="not-found__disk" />
        <span className="not-found__core" />
      </div>
      <p className="not-found__code">404</p>
      <h1 className="h1">{title}</h1>
      <p className="lede">{text}</p>
      <div className="row" style={{ "--gap": "12px", justifyContent: "center" }}>
        <Link to="/products" className="btn btn--primary" data-pulse>
          Browse products <Icon name="arrowRight" size={18} className="icon-arrow" />
        </Link>
        <Link to="/" className="btn btn--ghost">
          Go home
        </Link>
      </div>
    </div>
  );
}
