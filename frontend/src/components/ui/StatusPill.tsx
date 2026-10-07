interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const norm = status.toLowerCase();

  let colorClasses = "bg-slate-100 text-slate-700 border-slate-200";
  let dotColor = "bg-slate-500";
  let label = status;

  if (norm === "active" || norm === "ready" || norm === "approved" || norm === "allowed" || norm === "pass" || norm === "passed") {
    colorClasses = "bg-allow-bg text-allow border-allow-border";
    dotColor = "bg-allow";
    label = norm === "pass" || norm === "passed" ? "Passed" : status;
  } else if (norm === "pending" || norm === "processing" || norm === "queued" || norm === "abstained") {
    colorClasses = "bg-warn-bg text-warn border-warn-border";
    dotColor = "bg-warn";
    label = norm === "abstained" ? "No source" : status;
  } else if (norm === "flagged" || norm === "denied" || norm === "failed" || norm === "rejected" || norm === "deactivated" || norm === "suspended") {
    colorClasses = "bg-deny-bg text-deny border-deny-border";
    dotColor = "bg-deny";
    label = norm === "failed" ? "Failed" : status;
  }

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[0.7rem]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium uppercase tracking-wider font-mono ${sizeClasses} ${colorClasses}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="capitalize">{label}</span>
    </span>
  );
}

export function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line bg-surface-subtle px-2 py-0.5 text-[0.7rem] font-medium text-ink font-mono">
      {role}
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
    "bg-slate-100 text-slate-800 border-slate-200",
    "bg-blue-50 text-blue-800 border-blue-200",
    "bg-amber-50 text-amber-800 border-amber-200",
    "bg-rose-50 text-rose-800 border-rose-200",
  ];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.7rem] font-medium font-mono ${
        styles[clearance] || styles[0]
      }`}
    >
      <span>L{clearance}</span>
      <span>•</span>
      <span>{name}</span>
    </span>
  );
}
