import { cn } from "@/lib/utils";
import { statusClasses, statusLabel, type LicenseStatus } from "@/lib/format";

export function StatusBadge({ status }: { status: LicenseStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusClasses(status),
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
