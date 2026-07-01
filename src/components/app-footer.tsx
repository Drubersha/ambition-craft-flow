import { APP_VERSION_LABEL } from "@/lib/version";

/** Small muted site footer showing the release channel + SemVer version. */
export function AppFooter() {
  return (
    <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
      LeasePlease · {APP_VERSION_LABEL}
    </footer>
  );
}
