import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installStaleChunkReload } from "./staleChunkReload";
import "./style.css";

installStaleChunkReload();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
