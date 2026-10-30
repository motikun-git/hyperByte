import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

// Used until the real settings arrive (and if the API is unreachable).
// Contact details are empty on purpose: buttons only appear once the owner
// has entered real numbers and links in Admin -> Settings.
const DEFAULTS = {
  siteName: "hyperByte",
  tagline: "Second-hand PC hardware and laptops",
  logoUrl: "",
  heroTitle: "BUILD SMARTER. POWER BETTER.",
  heroPhrases: ["Premium PC hardware.", "Better value for your next build.", "Graphics cards. Components. Laptops.", "Available products. Pre-order opportunities."],
  heroText:
    "Quality-checked second-hand PC components and laptops from Rampura, Dhaka. See real photos and full specs, then talk to us directly on WhatsApp or Facebook.",
  whatsappNumber: "",
  whatsappNumberCn: "",
  facebookUrl: "https://www.facebook.com/hyperByteCn",
  messengerUrl: "https://m.me/hyperByteCn",
  phone: "",
  email: "",
  address: "Rampura, Dhaka, Bangladesh",
  mapUrl: "",
  hours: "",
  youtubeUrl: "",
  instagramUrl: "",
  tiktokUrl: "",
  showSoldProducts: true,
  warrantyTerms: "",
  metaDescription: "",
  customBuildMessage: "Hello hyperByte, I would like to discuss a custom PC build. Please help me with compatible components and pricing.",
  warrantyPolicy: "",
  warrantyPolicyReviewed: false,
  preorderInfo: "",
  preorderPolicy: "",
  aboutText: "",
};

const SettingsContext = createContext({ settings: DEFAULTS, loaded: false, refresh() {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api("/settings");
      setSettings({ ...DEFAULTS, ...data.settings });
    } catch {
      // keep defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ settings, loaded, refresh }), [settings, loaded, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
