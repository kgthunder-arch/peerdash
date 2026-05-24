import { useEffect, useState } from "react";
import { useSubscriptionStore, TIERS } from "../store/subscription";

export function UpgradeModal() {
  const [open, setOpen] = useState(false);
  const { startCheckout, isLoading } = useSubscriptionStore();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-upgrade", handler);
    return () => window.removeEventListener("open-upgrade", handler);
  }, []);

  if (!open) return null;

  async function handleUpgrade(tier: "pro" | "enterprise") {
    try {
      const url = await startCheckout(tier);
      if (url) window.location.href = url;
    } catch {
      alert("Checkout failed. Please try again.");
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Upgrade plan" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal-card upgrade-modal">
        <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
        <h2>Upgrade PeerDash</h2>
        <p className="muted">Unlock higher quotas, group transfers, and priority relay.</p>

        <div className="upgrade-tiers">
          {(["free", "pro", "enterprise"] as const).map((key) => {
            const tier = TIERS[key];
            return (
              <div key={key} className={`upgrade-tier ${key === "pro" ? "featured" : ""}`}>
                {key === "pro" && <div className="tier-badge">Most Popular</div>}
                <h3>{tier.name}</h3>
                <div className="tier-price">
                  {tier.price === 0 && key === "free" ? "Free" : tier.price === 0 ? "Custom" : `$${tier.price}/mo`}
                </div>
                <ul className="tier-features">
                  <li>Monthly quota: {key === "enterprise" ? "Unlimited" : formatBytes(tier.monthlyQuota)}</li>
                  <li>Max file size: {key === "enterprise" ? "Unlimited" : formatBytes(tier.maxFileSize)}</li>
                  <li>Parallel transfers: {tier.parallelTransfers === Infinity ? "Unlimited" : tier.parallelTransfers}</li>
                  <li>{tier.groupTransfers ? "✅" : "❌"} Group transfers</li>
                  <li>{tier.priorityRelay ? "✅" : "❌"} Priority relay</li>
                </ul>
                {key !== "free" && (
                  <button
                    className="primary"
                    onClick={() => handleUpgrade(key)}
                    disabled={isLoading}
                  >
                    {key === "enterprise" ? "Contact Sales" : "Upgrade Now"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  if (!isFinite(bytes)) return "Unlimited";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}
