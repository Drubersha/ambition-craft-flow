/**
 * Server-only helpers around `supabaseAdmin.auth.admin.listUsers`, which is
 * always paginated. Centralised so callers don't reinvent the loop, and so we
 * have a single place to enforce a sane safety cap.
 *
 * Import only from `.server.ts` / inside server-function handlers — never
 * from a route or component module-scope.
 */

const PAGE_SIZE = 200;
const MAX_PAGES = 50; // hard ceiling = 10k users; bump if needed

type AuthUser = {
  id: string;
  email: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
};

function pick(u: any): AuthUser {
  return {
    id: u.id,
    email: u.email ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at: u.created_at ?? null,
  };
}

/** Iterate all auth users, stopping at MAX_PAGES as a safety cap. */
export async function listAllAuthUsersPaginated(
  supabaseAdmin: any,
): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) out.push(pick(u));
    if (users.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * Find a single auth user by email (case-insensitive). Paginated scan.
 * Returns null if not found within MAX_PAGES.
 */
export async function findAuthUserByEmail(
  supabaseAdmin: any,
  email: string,
): Promise<AuthUser | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u: any) => (u.email ?? "").toLowerCase() === target);
    if (hit) return pick(hit);
    if (users.length < PAGE_SIZE) return null;
  }
  return null;
}

/**
 * Fetch auth-user metadata for a known set of user ids. Filters the paginated
 * scan so callers get just the rows they need. Stops early once every id has
 * been resolved.
 */
export async function getAuthUsersByIds(
  supabaseAdmin: any,
  ids: string[],
): Promise<Map<string, AuthUser>> {
  const want = new Set(ids);
  const found = new Map<string, AuthUser>();
  if (want.size === 0) return found;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      if (want.has(u.id)) {
        found.set(u.id, pick(u));
        if (found.size === want.size) return found;
      }
    }
    if (users.length < PAGE_SIZE) break;
  }
  return found;
}
