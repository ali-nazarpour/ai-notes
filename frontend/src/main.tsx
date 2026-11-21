import "@fontsource-variable/vazirmatn";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/editor.css";
import "./styles/features.css";
import "./styles/v4.css";
import "./styles/slides.css";
import "./styles/v5.css";
import "./styles/v6.css";
import "./styles/v7.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
