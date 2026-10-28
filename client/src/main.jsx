import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "./lib/router.jsx";
import { MotionProvider } from "./motion/MotionContext.jsx";
import { SettingsProvider } from "./context/SettingsContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import App from "./App.jsx";
import "./styles/base.css";
import "./styles/effects.css";
import "./styles/site.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Router>
      <MotionProvider>
        <SettingsProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SettingsProvider>
      </MotionProvider>
    </Router>
  </StrictMode>
);
