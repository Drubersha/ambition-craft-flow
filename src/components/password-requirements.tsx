import { Check, X } from "lucide-react";
import { PASSWORD_MIN, passwordChecks } from "@/lib/account.functions";

export type RequirementItem = { ok: boolean; label: string };

/**
 * Чек-лист правил пароля. Три правила берутся из passwordChecks (тот же код,
 * что проверяет сервер), дополнительные пункты формы («пароли совпадают»,
 * «отличается от текущего») передаются через extra.
 */
export function PasswordRequirements({
  password,
  extra = [],
}: {
  password: string;
  extra?: RequirementItem[];
}) {
  const c = passwordChecks(password);
  const items: RequirementItem[] = [
    { ok: c.length, label: `Не короче ${PASSWORD_MIN} символов` },
    { ok: c.letter, label: "Содержит букву" },
    { ok: c.digit, label: "Содержит цифру" },
    ...extra,
  ];
  return (
    <ul className="space-y-1 rounded-md border bg-muted/30 p-3">
      {items.map((r) => (
        <li
          key={r.label}
          className={
            "flex items-center gap-1.5 text-xs " + (r.ok ? "text-success" : "text-muted-foreground")
          }
        >
          {r.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {r.label}
        </li>
      ))}
    </ul>
  );
}
