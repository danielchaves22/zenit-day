import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
const HubConsent = React.lazy(() => import("./HubConsent"));
const HubRemindersConsent = React.lazy(() => import("./HubRemindersConsent"));
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/hub/reminders" ? (
      <React.Suspense fallback={<p>Carregando autorização…</p>}>
        <HubRemindersConsent />
      </React.Suspense>
    ) : window.location.pathname === "/oauth/consent" ? (
      <React.Suspense fallback={<p>Carregando autorização…</p>}>
        <HubConsent />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
