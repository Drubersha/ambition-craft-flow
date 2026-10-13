/**
 * Человеческий текст ошибки для тостов. Supabase/PostgREST возвращают
 * английские сообщения вида «duplicate key value violates unique constraint»;
 * пользователю нужен русский смысл, а техническая часть — в консоль.
 */

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
};

const BY_CODE: Record<string, string> = {
  // PostgreSQL
  "23505": "Такая запись уже есть — проверьте номер или название.",
  "23503": "Нельзя сохранить: запись ссылается на то, чего уже нет, или на неё ссылаются другие.",
  "23502": "Заполните обязательные поля.",
  "23514": "Значение не проходит проверку — посмотрите подсказки у полей.",
  "22P02": "Неверный формат значения (например, число или дата).",
  "22003": "Число слишком большое.",
  "42501": "Нет доступа к этой операции.",
  "42P01":
    "Сервер не знает такой таблицы — обновите страницу; если повторится, напишите в поддержку.",
  "57014": "Запрос выполнялся слишком долго — попробуйте ещё раз.",
  // PostgREST
  PGRST116: "Запись не найдена — возможно, её уже удалили.",
  PGRST301: "Сессия истекла — войдите заново.",
  PGRST204: "Поле не найдено на сервере — обновите страницу.",
};

const BY_TEXT: [RegExp, string][] = [
  [/invalid login credentials/i, "Неверный e-mail или пароль."],
  [/email not confirmed/i, "E-mail не подтверждён — проверьте почту."],
  [/user already registered|already been registered/i, "Пользователь с таким e-mail уже есть."],
  [/password should be at least/i, "Пароль слишком короткий."],
  [/rate limit|too many requests/i, "Слишком много попыток — подождите минуту."],
  [/jwt expired|invalid jwt|refresh token/i, "Сессия истекла — войдите заново."],
  [
    /failed to fetch|network ?error|load failed|fetch failed/i,
    "Нет связи с сервером — проверьте интернет и попробуйте снова.",
  ],
  [/row-level security/i, "Нет доступа к этой записи."],
  [/duplicate key/i, "Такая запись уже есть."],
  [/violates foreign key/i, "Запись связана с другими данными — сначала удалите их."],
  [/violates not-null/i, "Заполните обязательные поля."],
  [/payload too large|too large/i, "Файл слишком большой."],
];

/** Русское сообщение в тексте оставляем как есть (кириллица = уже наше). */
const CYRILLIC = /[а-яё]/i;

export function humanError(e: unknown, fallback = "Не удалось выполнить действие"): string {
  const err = (e ?? {}) as ErrorLike;
  const code = typeof err.code === "string" ? err.code : "";
  const message = typeof err.message === "string" ? err.message : typeof e === "string" ? e : "";

  if (code && BY_CODE[code]) return BY_CODE[code];
  if (message && CYRILLIC.test(message)) return message;
  for (const [re, text] of BY_TEXT) if (re.test(message)) return text;
  if (message && typeof console !== "undefined") console.warn("[humanError]", code, message);
  return fallback;
}
