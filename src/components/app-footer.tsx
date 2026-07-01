import { Clock, Mail, Phone, Send } from "lucide-react";
import { APP_VERSION_LABEL } from "@/lib/version";

/** Site footer: developer contacts (clickable) + release channel/version. */
export function AppFooter() {
  const linkCls = "inline-flex items-center gap-1 hover:text-foreground hover:underline";
  return (
    <footer className="border-t px-4 py-4 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 text-center">
        <div className="font-medium text-foreground/80">Контакты разработчика</div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <a href="https://t.me/Xina_aid" target="_blank" rel="noreferrer" className={linkCls}>
            <Send className="h-3.5 w-3.5" /> @Xina_aid
          </a>
          <a href="mailto:aidar.marchenko@gmail.com" className={linkCls}>
            <Mail className="h-3.5 w-3.5" /> aidar.marchenko@gmail.com
          </a>
          <a href="mailto:aidar.marchenko@mail.ru" className={linkCls}>
            <Mail className="h-3.5 w-3.5" /> aidar.marchenko@mail.ru
          </a>
          <a href="tel:+79270390031" className={linkCls}>
            <Phone className="h-3.5 w-3.5" /> +7 (927) 039-00-31
          </a>
        </div>
        <div className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> Время работы: 9:00–18:00 по МСК, по будням
        </div>
        <div className="pt-1">LeasePlease · {APP_VERSION_LABEL}</div>
      </div>
    </footer>
  );
}
