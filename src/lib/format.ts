export function formatDate(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export type LicenseStatus = "active" | "trial" | "expired" | "revoked" | string;

export function statusLabel(status: LicenseStatus): string {
  const map: Record<string, string> = {
    active: "Ativa",
    trial: "Teste",
    expired: "Expirada",
    revoked: "Revogada",
    lifetime: "Vitalícia",
  };
  return map[status] ?? status;
}

export function statusClasses(status: LicenseStatus): string {
  switch (status) {
    case "active":
      return "bg-success/15 text-success border-success/30";
    case "trial":
      return "bg-warning/15 text-warning border-warning/30";
    case "expired":
      return "bg-muted text-muted-foreground border-border";
    case "revoked":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
