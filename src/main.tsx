import React from "react";
import ReactDOM from "react-dom/client";
import { SnapshotProvider } from "./state/SnapshotProvider";
import { App } from "./App";
import "./styles.css";
import "./desktop-theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SnapshotProvider><App /></SnapshotProvider>
  </React.StrictMode>,
);

