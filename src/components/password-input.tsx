import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Поле пароля с кнопкой «показать/скрыть» — общее для входа, регистрации, сброса и настроек. */
export function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  disabled,
  required = true,
  minLength,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name ?? id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        minLength={minLength}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
