import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
const HubConsent = React.lazy(() => import("./HubConsent"));
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/oauth/consent" ? <React.Suspense fallback={<p>Carregando autorização…</p>}><HubConsent /></React.Suspense> : <App />}
  </React.StrictMode>,
);
