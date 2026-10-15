import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Copy, Download, KeyRound, Plus } from "lucide-react";
import { humanError } from "@/lib/human-error";
import { formatDate } from "@/lib/format";
import {
  createImportToken,
  listImportBatches,
  listImportHistory,
  listImportTokens,
  revokeImportToken,
  type ImportBatchRow,
} from "@/lib/import.functions";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

const DOCS_URL = "https://github.com/Drubersha/ambition-craft-flow/tree/main/docs/1c";

function endpointUrl() {
  if (typeof window === "undefined") return "/api/1c/import";
  return `${window.location.origin}/api/1c/import`;
}

function statusBadge(b: ImportBatchRow) {
  if (b.status === "ok")
    return (
      <Badge variant={b.dry_run ? "secondary" : "default"}>
        {b.dry_run ? "проверка" : "принят"}
      </Badge>
    );
  if (b.status === "rejected") return <Badge variant="destructive">отклонён</Badge>;
  if (b.status === "failed") return <Badge variant="destructive">сбой записи</Badge>;
  return <Badge variant="outline">{b.status}</Badge>;
}

type Counts = Record<
  string,
  {
    received: number;
    created: number;
    updated: number;
    linked: number;
    unchanged: number;
    voided: number;
  }
>;

function countsLine(report: ImportBatchRow["report"]): string {
  const counts = (report?.counts ?? null) as unknown as Counts | null;
  if (!counts) {
    const errors = (report?.errors as unknown[] | undefined)?.length;
    return errors ? `ошибок: ${errors}` : "—";
  }
  const sum = (k: keyof Counts[string]) =>
    Object.values(counts).reduce((s, c) => s + (c[k] ?? 0), 0);
  return `создано ${sum("created")} · обновлено ${sum("updated") + sum("linked")} · без изменений ${sum("unchanged")} · аннулировано ${sum("voided")}`;
}

function TokensCard() {
  const qc = useQueryClient();
  const list = useServerFn(listImportTokens);
  const create = useServerFn(createImportToken);
  const revoke = useServerFn(revokeImportToken);
  const { data: tokens } = useQuery({ queryKey: ["import-tokens"], queryFn: () => list() });
  const [label, setLabel] = useState("1С, ночная выгрузка");
  const [ips, setIps] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          label,
          allowedIps: ips
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (res) => {
      setFresh(res.token);
      qc.invalidateQueries({ queryKey: ["import-tokens"] });
    },
    onError: (e) => toast.error(humanError(e, "Не удалось создать токен")),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Токен отозван");
      qc.invalidateQueries({ queryKey: ["import-tokens"] });
    },
    onError: (e) => toast.error(humanError(e, "Не удалось отозвать токен")),
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать — выделите и скопируйте вручную");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Токены приёмника
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Токен передаётся 1С в заголовке <code>Authorization: Bearer …</code>. Показывается один
          раз при создании; в базе хранится только хэш.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!createMut.isPending) createMut.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="token-label">Название</Label>
            <Input
              id="token-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="token-ips">Разрешённые IP (необязательно)</Label>
            <Input
              id="token-ips"
              value={ips}
              onChange={(e) => setIps(e.target.value)}
              placeholder="например 95.12.34.56, через запятую"
            />
          </div>
          <Button type="submit" disabled={createMut.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Создать токен
          </Button>
        </form>

        {(tokens ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Токенов пока нет.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead className="hidden sm:table-cell">IP</TableHead>
                <TableHead className="hidden md:table-cell">Создан</TableHead>
                <TableHead>Последний вызов</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tokens ?? []).map((t) => (
                <TableRow key={t.id} className={t.revoked_at ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    {t.label}
                    {t.revoked_at && (
                      <Badge variant="outline" className="ml-2">
                        отозван
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {t.allowed_ips.length ? t.allowed_ips.join(", ") : "любой"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {formatDate(t.created_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.last_used_at
                      ? new Date(t.last_used_at).toLocaleString("ru-RU")
                      : "ещё не было"}
                  </TableCell>
                  <TableCell className="text-right">
                    {!t.revoked_at && (
                      <ConfirmButton
                        variant="ghost"
                        size="sm"
                        destructive
                        title="Отозвать токен?"
                        description="1С перестанет проходить авторизацию с этим токеном. Действие необратимо — создайте новый токен."
                        confirmText="Отозвать"
                        onConfirm={() => revokeMut.mutate(t.id)}
                      >
                        Отозвать
                      </ConfirmButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={fresh !== null} onOpenChange={(o) => !o && setFresh(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Токен создан</DialogTitle>
            <DialogDescription>
              Скопируйте и передайте в 1С сейчас: после закрытия окна токен больше нигде не
              показывается.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={fresh ?? ""}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Скопировать токен"
              onClick={() => fresh && copy(fresh)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setFresh(null)}>
              Я сохранил токен
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function HowToCard() {
  const url = endpointUrl();
  const curl = `curl -X POST "${url}?dry_run=1" \\\n  -H "Authorization: Bearer <токен>" \\\n  -H "Content-Type: application/json; charset=utf-8" \\\n  --data-binary @1c-export.json`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Как отправлять</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>
          Адрес: <code className="text-xs">{url}</code> (POST). Добавьте{" "}
          <code className="text-xs">?dry_run=1</code>, чтобы только проверить файл: отчёт вернётся,
          в базу ничего не попадёт.
        </div>
        <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre">{curl}</pre>
        <div className="text-muted-foreground">
          Формат файла, пустой шаблон, пример и JSON Schema —{" "}
          <a href={DOCS_URL} target="_blank" rel="noreferrer" className="underline">
            docs/1c в репозитории
          </a>
          . Окно документов — 6 месяцев; справочники — целиком; ключ — GUID 1С.
        </div>
      </CardContent>
    </Card>
  );
}

function BatchDetails({ batch }: { batch: ImportBatchRow }) {
  const history = useServerFn(listImportHistory);
  const { data: rows } = useQuery({
    queryKey: ["import-history", batch.id],
    queryFn: () => history({ data: { batchId: batch.id } }),
    enabled: batch.status === "ok" && !batch.dry_run,
  });
  const report = (batch.report ?? {}) as Record<string, unknown>;
  const errors = (report.errors as { path: string; message: string }[] | undefined) ?? [];
  const skipped =
    (report.skipped as { path: string; id?: string; reason: string }[] | undefined) ?? [];
  const warnings =
    (report.warnings as { path: string; id?: string; reason: string }[] | undefined) ?? [];
  const mismatches =
    (report.balance_mismatches as
      | {
          counterparty: string;
          contract: string | null;
          ours: number;
          theirs: number;
          diff: number;
        }[]
      | undefined) ?? [];
  const counts = (report.counts as Counts | undefined) ?? null;
  return (
    <div className="space-y-3 text-sm">
      {batch.error && <div className="text-destructive">Ошибка: {batch.error}</div>}
      {counts && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Блок</TableHead>
              <TableHead className="text-right">Получено</TableHead>
              <TableHead className="text-right">Создано</TableHead>
              <TableHead className="text-right">Обновлено</TableHead>
              <TableHead className="text-right">Привязано</TableHead>
              <TableHead className="text-right">Без изм.</TableHead>
              <TableHead className="text-right">Аннулировано</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(counts).map(([k, c]) => (
              <TableRow key={k}>
                <TableCell>{k}</TableCell>
                <TableCell className="text-right tabular-nums">{c.received}</TableCell>
                <TableCell className="text-right tabular-nums">{c.created}</TableCell>
                <TableCell className="text-right tabular-nums">{c.updated}</TableCell>
                <TableCell className="text-right tabular-nums">{c.linked}</TableCell>
                <TableCell className="text-right tabular-nums">{c.unchanged}</TableCell>
                <TableCell className="text-right tabular-nums">{c.voided}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {errors.length > 0 && (
        <div>
          <div className="font-medium mb-1">Ошибки проверки ({errors.length})</div>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            {errors.slice(0, 50).map((e, i) => (
              <li key={i}>
                <code>{e.path}</code>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {skipped.length > 0 && (
        <div>
          <div className="font-medium mb-1">Пропущено ({skipped.length})</div>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            {skipped.map((s, i) => (
              <li key={i}>
                {s.path}
                {s.id ? ` · ${s.id}` : ""}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <div className="font-medium mb-1">Предупреждения ({warnings.length})</div>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            {warnings.map((s, i) => (
              <li key={i}>
                {s.path}
                {s.id ? ` · ${s.id}` : ""}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {mismatches.length > 0 && (
        <div>
          <div className="font-medium mb-1">Расхождения сальдо с 1С ({mismatches.length})</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Арендатор</TableHead>
                <TableHead>Договор</TableHead>
                <TableHead className="text-right">У нас</TableHead>
                <TableHead className="text-right">В 1С</TableHead>
                <TableHead className="text-right">Разница</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mismatches.map((m, i) => (
                <TableRow key={i}>
                  <TableCell>{m.counterparty}</TableCell>
                  <TableCell>{m.contract ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.ours.toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.theirs.toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    {m.diff.toLocaleString("ru-RU")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div>
          <div className="font-medium mb-1">
            Изменения ({rows.length}
            {rows.length === 500 ? "+" : ""})
          </div>
          <ul className="space-y-0.5 text-xs max-h-72 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="font-mono">
                {r.table_name} · {r.action} · {r.external_id ?? r.record_id}
                {r.action === "update" || r.action === "link"
                  ? ` · ${Object.keys(r.after ?? {})
                      .filter((k) => k !== "external_id")
                      .join(", ")}`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BatchesCard() {
  const list = useServerFn(listImportBatches);
  const { data: batches, isLoading } = useQuery({
    queryKey: ["import-batches"],
    queryFn: () => list(),
    refetchInterval: 60_000,
  });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Пакеты</CardTitle>
        <p className="text-xs text-muted-foreground">
          Каждый принятый, проверенный или отклонённый файл. Нажмите на строку, чтобы увидеть отчёт.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Загрузка…</div>
        ) : (batches ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Файлов ещё не было. Создайте токен и отправьте первый файл с <code>?dry_run=1</code>.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Получен</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="hidden md:table-cell">Окно</TableHead>
                <TableHead>Итог</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Время</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(batches ?? []).map((b) => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer"
                  onClick={() => setOpen(open === b.id ? null : b.id)}
                >
                  <TableCell className="whitespace-nowrap">
                    {new Date(b.received_at).toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell>{statusBadge(b)}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground whitespace-nowrap">
                    {b.period_from
                      ? `${formatDate(b.period_from)} — ${formatDate(b.period_to)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {countsLine(b.report)}
                    {open === b.id && (
                      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                        <BatchDetails batch={b} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
                    {b.duration_ms != null ? `${(b.duration_ms / 1000).toFixed(1)} с` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ImportPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Download className="h-6 w-6 text-primary" /> Импорт из 1С
          </span>
        }
        description="Приёмник ежедневного файла: токены, журнал пакетов, расхождения с 1С"
      />
      <HowToCard />
      <TokensCard />
      <BatchesCard />
    </div>
  );
}
