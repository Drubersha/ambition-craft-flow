/**
 * Демо-режим и выбор активного аккаунта живут в localStorage браузера.
 * Ключи и операции над ними — только здесь: кто ставит ключи (вход в демо),
 * тот и снимает (выход), а остальной код спрашивает isDemoSession().
 */
export const DEMO_STORAGE = {
  /** Выбранная роль интерфейса (DemoIdentityProvider). */
  role: "demo.role",
  /** Просмотр «как арендатор»: id арендатора. */
  tenantId: "demo.tenantId",
  /** Какой демо-аккаунт активен (demo / demo2 / moderator / developer); у обычных аккаунтов ключа нет. */
  kind: "demo.kind",
  /** Какой из пары аккаунтов владелец/арендатор активен после входа. */
  accountKind: "active_account_kind",
} as const;

const canStore = () => typeof window !== "undefined";

export function isDemoSession(): boolean {
  return canStore() && !!localStorage.getItem(DEMO_STORAGE.kind);
}

export function getDemoKind(): string | null {
  return canStore() ? localStorage.getItem(DEMO_STORAGE.kind) : null;
}

export function getActiveAccountKind(): string | null {
  return canStore() ? localStorage.getItem(DEMO_STORAGE.accountKind) : null;
}

export function setActiveAccountKind(kind: string): void {
  if (canStore()) localStorage.setItem(DEMO_STORAGE.accountKind, kind);
}

/** Вход в демо: роль интерфейса, вид демо-аккаунта, активный аккаунт — «владелец». */
export function startDemoSession(kind: string, role: string): void {
  if (!canStore()) return;
  localStorage.setItem(DEMO_STORAGE.accountKind, "owner");
  localStorage.setItem(DEMO_STORAGE.role, role);
  localStorage.setItem(DEMO_STORAGE.kind, kind);
}

/** Выход: снимает всё, что ставил вход (demo.tenantId не трогаем, как и раньше). */
export function clearDemoSession(): void {
  if (!canStore()) return;
  localStorage.removeItem(DEMO_STORAGE.role);
  localStorage.removeItem(DEMO_STORAGE.accountKind);
  localStorage.removeItem(DEMO_STORAGE.kind);
}

/** Демо-аккаунты живут на псевдодомене *.local (см. DEMO_ACCOUNTS в demo-auth.functions.ts). */
export function isDemoEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(".local");
}
