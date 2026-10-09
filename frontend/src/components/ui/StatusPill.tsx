interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const norm = status.toLowerCase();

  let colorClasses = "bg-surface-subtle text-ink-light border-line";
  let dotColor = "bg-muted";
  let label = status;

  if (norm === "active" || norm === "ready" || norm === "approved" || norm === "allowed" || norm === "pass" || norm === "passed") {
    colorClasses = "bg-allow-bg text-allow border-allow-border";
    dotColor = "bg-allow";
    label = norm === "pass" || norm === "passed" ? "Passed" : status;
  } else if (norm === "answered" || norm === "verified" || norm === "computed") {
    colorClasses = "bg-allow-bg text-allow border-allow-border";
    dotColor = "bg-allow";
  } else if (norm === "pending" || norm === "processing" || norm === "queued" || norm === "abstained") {
    colorClasses = "bg-warn-bg text-warn border-warn-border";
    dotColor = "bg-warn";
    label = norm === "abstained" ? "No source" : status;
  } else if (norm === "flagged" || norm === "denied" || norm === "failed" || norm === "rejected" || norm === "deactivated" || norm === "suspended" || norm === "refused" || norm === "redacted") {
    colorClasses = "bg-deny-bg text-deny border-deny-border";
    dotColor = "bg-deny";
    label = norm === "failed" ? "Failed" : status;
  }

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[0.7rem]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide ${sizeClasses} ${colorClasses}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="capitalize">{label}</span>
    </span>
  );
}

export function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ai/25 bg-ai/10 px-2 py-0.5 text-[0.68rem] font-semibold text-ai">
      {role.replace(/_/g, " ")}
    </span>
  );
}

export function ClearancePill({
  clearance,
  label,
}: {
  clearance: number;
  label?: string;
}) {
  const names = ["Public", "Internal", "Confidential", "Restricted"];
  const name = label || names[clearance] || `Level ${clearance}`;

  const styles = [
    "bg-level-0/10 text-level-0 border-level-0/30",
    "bg-level-1/10 text-level-1 border-level-1/30",
    "bg-level-2/10 text-level-2 border-level-2/30",
    "bg-level-3/10 text-level-3 border-level-3/30",
  ];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${
        styles[clearance] || styles[0]
      }`}
    >
      <span>L{clearance}</span>
      <span>•</span>
      <span>{name}</span>
    </span>
  );
}
