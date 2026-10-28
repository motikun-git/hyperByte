import { useMemo } from "react";
import { useSettings } from "../../context/SettingsContext.jsx";

/** The black-hole mark used in the header and footer. */
export function LogoMark({ size = 34 }) {
  // Unique gradient ids per copy, so a hidden copy never breaks a visible one.
  const id = useMemo(() => `lm${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="0.5" stopColor="#E0D8FF" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8B5CF6" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#${id}g)`} />
      <ellipse cx="32" cy="33" rx="27" ry="9" fill="none" stroke={`url(#${id}d)`} strokeWidth="3.4" opacity="0.5" transform="rotate(-18 32 33)" />
      <circle cx="32" cy="32.5" r="13.2" fill="none" stroke="#EDE9FF" strokeWidth="1.6" />
      <circle cx="32" cy="32.5" r="11.8" fill="#000" />
      <path d="M6.3 41.4 A27 9 -18 0 0 57.7 24.7" fill="none" stroke={`url(#${id}d)`} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ compact = false }) {
  const { settings } = useSettings();
  if (settings.logoUrl) {
    return (
      <span className="logo">
        <img className="logo__img" src={settings.logoUrl} alt={settings.siteName} height="36" />
      </span>
    );
  }
  return (
    <span className="logo">
      <LogoMark />
      {!compact ? <span className="logo__word">{settings.siteName}</span> : <span className="sr-only">{settings.siteName}</span>}
    </span>
  );
}
