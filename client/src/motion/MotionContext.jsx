import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const MotionContext = createContext({ reduced: false, userOff: false, systemReduced: false, toggle() {} });
const KEY = "hb_motion";

function readUserChoice() {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

// Decorative motion is off when the visitor asked for reduced motion in their
// system settings, or turned it off with the motion button on the site.
export function MotionProvider({ children }) {
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [userOff, setUserOff] = useState(readUserChoice);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setSystemReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const reduced = systemReduced || userOff;
  useEffect(() => {
    document.documentElement.classList.toggle("motion-off", reduced);
  }, [reduced]);

  const toggle = useCallback(() => {
    setUserOff((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? "off" : "on");
      } catch {
        // private mode: the choice lasts until the tab closes
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ reduced, userOff, systemReduced, toggle }), [reduced, userOff, systemReduced, toggle]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export const useMotion = () => useContext(MotionContext);
