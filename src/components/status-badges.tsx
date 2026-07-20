import { Badge } from "@/components/ui/badge";
import { CHARGE_STATUS_LABELS, CONTRACT_STATUS_LABELS } from "@/lib/format";

/** Бейдж статуса начисления: paid — default, overdue — destructive, иначе secondary. */
export function ChargeStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      className={className}
      variant={status === "paid" ? "default" : status === "overdue" ? "destructive" : "secondary"}
    >
      {CHARGE_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Бейдж статуса договора: active — default, иначе secondary. */
export function ContractStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge className={className} variant={status === "active" ? "default" : "secondary"}>
      {CONTRACT_STATUS_LABELS[status]}
    </Badge>
  );
}
