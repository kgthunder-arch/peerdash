import { useState, useEffect } from "react";

const STEPS = [
  {
    title: "Welcome to PeerDash",
    icon: "🚀",
    body: "Transfer files directly between devices — no cloud, no size limits, no waiting. Everything goes peer-to-peer and is end-to-end encrypted."
  },
  {
    title: "Create a Room",
    icon: "🔗",
    body: "Click \"Create sender room\" on the Connect tab. Share the 6-character code or QR code with the person you want to send files to."
  },
  {
    title: "Join & Connect",
    icon: "📱",
    body: "The receiver enters the room code or scans the QR. Once both devices are in the room, a direct encrypted channel opens automatically."
  },
  {
    title: "Drag, Drop & Send",
    icon: "📂",
    body: "Drag files onto the Send tab, or click \"Add files\". Files transfer instantly with real-time progress, pause/resume, and speed stats."
  },
  {
    title: "Encrypted by Default",
    icon: "🔒",
    body: "Every transfer uses NaCl end-to-end encryption. The lock icon means your files are encrypted before they leave your device."
  }
];

const STORAGE_KEY = "peerdash-onboarding-done";

export function OnboardingTutorial() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);
  }, []);

  function finish() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Getting started tutorial">
      <div className="onboarding-card">
        <button className="onboarding-skip" onClick={finish} aria-label="Skip tutorial">Skip</button>

        <div className="onboarding-icon" aria-hidden="true">{current.icon}</div>
        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-body">{current.body}</p>

        <div className="onboarding-dots" role="tablist" aria-label="Tutorial steps">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`onboarding-dot${i === step ? " active" : ""}`}
              onClick={() => setStep(i)}
              role="tab"
              aria-selected={i === step}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="onboarding-back" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </button>
          )}
          <button
            className="primary onboarding-next"
            onClick={isLast ? finish : () => setStep((s) => s + 1)}
          >
            {isLast ? "Get started →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
