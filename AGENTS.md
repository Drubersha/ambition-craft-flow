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

The production server runs the stack with Docker Compose and is meant to track `main`. Keeping the server in sync with `main` requires that the server's working tree is clean and fast-forwardable — so the server's real config (`Dockerfile`, `docker-compose.yml`, `Caddyfile`, `server-runner.mjs`, etc.) must be committed to the repo (i.e. `main` is the single source of truth). `.env` stays untracked (secrets) and is managed only on the server.

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
