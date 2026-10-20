import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/b612-mono/latin-400.css";
import "@fontsource/b612-mono/latin-700.css";
import "./styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
