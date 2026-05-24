import { useState } from "react";
import { useAuthStore } from "../store/auth";
import { useSubscriptionStore } from "../store/subscription";

export function UserHeader() {
  const { user, logout } = useAuthStore();
  const { tier, getQuotaPercentage, getRemainingQuota } = useSubscriptionStore();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const quotaPct = getQuotaPercentage();
  const remaining = getRemainingQuota();

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
  }

  return (
    <div className="user-header">
      <div className="user-info" onClick={() => setMenuOpen((o) => !o)} role="button" aria-haspopup="true" aria-expanded={menuOpen} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setMenuOpen((o) => !o)}>
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name || user.email} className="user-avatar" />
        ) : (
          <div className="user-avatar-placeholder" aria-hidden="true">
            {(user.name || user.email)[0].toUpperCase()}
          </div>
        )}
        <div className="user-details">
          <span className="user-name">{user.name || user.email}</span>
          <span className="user-tier" data-tier={tier}>{tier.toUpperCase()}</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ opacity: 0.6 }}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {menuOpen && (
        <div className="user-menu" role="menu">
          <div className="user-menu-quota">
            <div className="quota-label">
              <span>Monthly quota</span>
              <span>{formatBytes(remaining)} left</span>
            </div>
            <div className="quota-bar" role="progressbar" aria-valuenow={quotaPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="quota-fill" style={{ width: `${Math.min(quotaPct, 100)}%`, background: quotaPct > 90 ? "#ff6b6b" : quotaPct > 70 ? "#ffcf5a" : "#37d4aa" }} />
            </div>
          </div>
          {tier === "free" && (
            <button className="user-menu-upgrade" role="menuitem" onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("open-upgrade")); }}>
              ⚡ Upgrade to Pro
            </button>
          )}
          <button className="user-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); logout(); }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
