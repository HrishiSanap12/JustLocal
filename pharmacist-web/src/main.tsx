import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";
import AdminPanel from "./AdminPanel";

const Root = window.location.pathname.replace(/\/+$/, "") === "/admin" ? AdminPanel : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);