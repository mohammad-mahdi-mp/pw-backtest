import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Toasts } from "./components/toast/Toasts";
import { ThemeProvider } from "./design/ThemeProvider";
import "./app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
      <Toasts />
    </ThemeProvider>
  </React.StrictMode>,
);
