// Search your products by name or ID and pick one (used for warranties and pre-order inquiries).
import { useEffect, useId, useRef, useState } from "react";
import Icon, { CategoryIcon } from "../../components/ui/Icon.jsx";
import { StatusBadge } from "../../components/product/ProductBits.jsx";
import { qs } from "../../lib/api.js";
import { adminApi } from "../adminApi.js";

export default function ProductPicker({ value, onPick, onClear, placeholder = "Search by product name or ID", label = "Product" }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await adminApi(`/admin/products${qs({ q: q.trim(), limit: 8 })}`, { signal: ctrl.signal });
        setItems(res.items || []);
        setActive(0);
      } catch {
        // ignore while typing
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (value) {
    return (
      <div className="a-picked">
        <span className="a-thumb">
          {value.image ? <img src={value.image.thumb || value.image.url} alt="" /> : <CategoryIcon type={value.category?.icon} size={20} strokeWidth={1.5} />}
        </span>
        <span className="a-item__main">
          <span className="a-item__title">{value.name}</span>
          <span className="a-item__meta">
            <span>{value.sku || value.id}</span>
            {value.status ? <StatusBadge status={value.status} /> : null}
          </span>
        </span>
        <button type="button" className="a-iconbtn" onClick={onClear} aria-label="Choose another product">
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  }

  const choose = (item) => {
    onPick(item);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="a-picker" ref={boxRef}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="a-search">
        <Icon name="search" size={17} />
        <input
          id={id}
          className="input"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(items[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>
      {open ? (
        <ul id={`${id}-list`} className="a-picker__list" role="listbox">
          {loading && !items.length ? <li className="faint small" style={{ padding: 10 }}>Searching...</li> : null}
          {!loading && !items.length ? <li className="faint small" style={{ padding: 10 }}>No products found. You can type the name in the field below instead.</li> : null}
          {items.map((item, i) => (
            <li key={item.dbId} role="option" aria-selected={i === active}>
              <button type="button" className={`a-picker__opt${i === active ? " is-active" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => choose(item)}>
                <span className="a-thumb">
                  {item.image ? <img src={item.image.thumb || item.image.url} alt="" /> : <CategoryIcon type={item.category?.icon} size={18} strokeWidth={1.5} />}
                </span>
                <span className="a-item__main">
                  <span className="a-item__title">{item.name}</span>
                  <span className="a-item__meta">
                    <span>{item.sku}</span>
                    <StatusBadge status={item.status} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
