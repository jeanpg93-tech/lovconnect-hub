import { useState } from "react";
import { Copy, Check, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RevealSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  secret: string | null;
}

/**
 * Shows a freshly created secret (license key / API token) exactly once.
 * The value is never persisted in plaintext — once this dialog closes the
 * user can only see the masked version in the listings.
 */
export function RevealSecretDialog({
  open,
  onOpenChange,
  title,
  description,
  secret,
}: RevealSecretDialogProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success("Copiado para a área de transferência.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar automaticamente. Copie manualmente.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/60">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              "Copie e guarde agora. Por segurança, este valor completo não será exibido novamente."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
          <span>Exibido apenas uma vez. Depois disso, apenas a versão mascarada.</span>
        </div>

        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-sm">
            {secret ?? "—"}
          </code>
          <Button type="button" variant="secondary" size="icon" onClick={copy} title="Copiar">
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Já copiei</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
