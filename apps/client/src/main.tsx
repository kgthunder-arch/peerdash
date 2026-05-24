import React from "react";
import ReactDOM from "react-dom/client";
import "webrtc-adapter";
import App from "./App";
import "./styles.css";
import { NotificationToast } from "./components/NotificationToast";
import { OnboardingTutorial } from "./components/OnboardingTutorial";
import { UpgradeModal } from "./components/UpgradeModal";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <NotificationToast />
    <OnboardingTutorial />
    <UpgradeModal />
  </React.StrictMode>
);
