<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Continuous integration

`.github/workflows/ci.yml` runs `bun install`, `bun run typecheck`, `bun run lint`, and `bun run test` on every pull request to `main` and on pushes to `main`. To make `main` only accept code that passes: GitHub → Settings → Branches → add a branch protection rule for `main` and require the **CI / checks** status check (and a PR before merging). Workflow: develop on a branch → open a PR to `main` → merge only when CI is green.

## Production deployment (self-hosted server)

The production server runs the stack with Docker Compose and is meant to track `main`. Keeping the server in sync with `main` requires that the server's working tree is clean and fast-forwardable — so the server's real config (`Dockerfile`, `docker-compose.yml`, etc.) must be committed to the repo (i.e. `main` is the single source of truth). `.env` stays untracked (secrets) and is managed only on the server.

The app image is a Nitro **node-server** build: `bun run build` emits `.output/server/index.mjs` (the `Dockerfile` copies `.output` and runs `node .output/server/index.mjs`). This is set via `nitro: { preset: "node-server" }` in `vite.config.ts` — without it the shared Lovable config defaults to a Cloudflare target that emits `dist/` and the Docker build fails on `COPY --from=build /app/.output`.

- Manual update: `./scripts/server-update.sh` (fast-forwards to `origin/main`, then `docker compose up -d --build`; it does nothing if already up to date and refuses to clobber a dirty tree).
- Scheduled update (daily 00:01): install the provided systemd units, adjusting `WorkingDirectory`/paths to the repo location on the server:
  ```bash
  cp scripts/leaseplease-update.service /etc/systemd/system/
  cp scripts/leaseplease-update.timer   /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now leaseplease-update.timer
  systemctl list-timers leaseplease-update.timer   # verify next run
  ```
  Trigger on demand with `systemctl start leaseplease-update.service`. Logs go to `/var/log/leaseplease-deploy.log` (override with `DEPLOY_LOG`).
- Remember: `VITE_*` values are baked in at build time, so the script always rebuilds (`--build`); changing them requires a rebuild, which the update performs automatically.

## Backups (data)

Code is recoverable from git; the irreplaceable part is **data**, so backups cover Postgres (all schemas: `public`, `auth`, `storage`) + the uploaded `storage` files + a copy of `.env`.

- `scripts/backup.sh <label>` writes `BACKUP_ROOT` (default `/root/leaseplease-backups`)`/<label>/<timestamp>/` with `db.sql.gz`, `storage.tar.gz`, `env.backup`, `code-commit.txt`, and keeps the newest `BACKUP_KEEP` (default 2) per label.
- Two restore points are maintained automatically:
  - **Pre-change:** `deploy.yml` runs `scripts/backup.sh predeploy` before updating app code on every deploy.
  - **Previous day:** the `leaseplease-backup.timer` systemd unit runs `scripts/backup.sh daily` at 00:00 (one minute before the 00:01 deploy).
- Install the daily timer once on the server:
  ```bash
  cp scripts/leaseplease-backup.service /etc/systemd/system/
  cp scripts/leaseplease-backup.timer   /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now leaseplease-backup.timer
  ```
- Restore: `./scripts/restore.sh /root/leaseplease-backups/<label>/<timestamp>` (overwrites current DB + storage; prompts for confirmation). Verify a backup by restoring `db.sql.gz` into a throwaway database first.
- Backups contain secrets (`env.backup`) — keep `BACKUP_ROOT` root-only and off the public internet. Monitor disk usage under `BACKUP_ROOT`.

## Resetting data for a clean launch

`scripts/reset-data.sh` wipes ALL business data (truncates every domain table + `storage.objects` + uploaded files) and deletes every account **except** the technical ones, for a clean field-test start. It takes a backup (`prereset` label) first and requires typing `RESET` to proceed.

```bash
KEEP_EMAILS="admin@rentflow.local,moderator@rentflow.local" ./scripts/reset-data.sh
```

`KEEP_EMAILS` (CSV, lowercase) defaults to the `*.rentflow.local` technical accounts — verify/edit it for the real environment. Kept accounts retain their `profiles` and `user_roles`. This is destructive; restore from the `prereset` backup if needed.
