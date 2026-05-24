interface EncryptionBadgeProps {
  active: boolean;
  className?: string;
}

export function EncryptionBadge({ active, className = "" }: EncryptionBadgeProps) {
  return (
    <span
      className={`encryption-badge ${active ? "active" : "inactive"} ${className}`}
      title={active ? "End-to-end encrypted transfer" : "Encryption not active"}
      aria-label={active ? "End-to-end encrypted" : "Not encrypted"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      {active ? "E2E Encrypted" : "Unencrypted"}
    </span>
  );
}
