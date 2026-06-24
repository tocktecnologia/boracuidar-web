import React from "react";
import ReactDOM from "react-dom/client";
import { PostHogProvider } from "@posthog/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import posthog, { initPostHog } from "./lib/posthog";
import "./styles/app.css";

initPostHog();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PostHogProvider>
  </React.StrictMode>,
);
