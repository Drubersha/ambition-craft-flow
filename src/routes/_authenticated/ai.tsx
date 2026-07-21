import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { askAi, clearAiHistory, getAiHistory } from "@/lib/ai-chat.functions";
import { ConfirmButton } from "@/components/confirm-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Bot, CornerDownLeft, ExternalLink, Loader2, Trash2, User } from "lucide-react";
import type { AiLink } from "@/lib/ai-tools.server";

const searchSchema = z.object({
  q: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/_authenticated/ai")({
  validateSearch: zodValidator(searchSchema),
  component: AiChatPage,
});

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; links: AiLink[]; facts?: string; degraded?: boolean };

const EXAMPLES = [
  "Кто больше всех должен?",
  "Какой доход за июнь?",
  "Какие договоры скоро истекают?",
  "Какая занятость по контурам?",
];

function AiChatPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ask = useServerFn(askAi);
  const loadHistory = useServerFn(getAiHistory);
  const clearHistory = useServerFn(clearAiHistory);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef<string | null>(null);
  const historyLoadedRef = useRef(false);

  // Переписка хранится на сервере — подхватываем её при открытии страницы.
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["ai-history"],
    queryFn: () => loadHistory(),
  });

  useEffect(() => {
    if (!history || historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    setMessages(
      history.map((m) =>
        m.role === "user"
          ? { role: "user", text: m.text }
          : { role: "assistant", text: m.text, links: m.links ?? [], facts: m.facts },
      ),
    );
  }, [history]);

  const clearMutation = useMutation({
    mutationFn: () => clearHistory(),
    onSuccess: () => {
      setMessages([]);
      qc.setQueryData(["ai-history"], []);
    },
  });

  const mutation = useMutation({
    mutationFn: (question: string) => ask({ data: { question } }),
    onSuccess: (res) => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: res.answer,
          links: (res.links ?? []) as AiLink[],
          facts: "facts" in res ? res.facts : undefined,
          degraded: "modelUsed" in res ? !res.modelUsed : false,
        },
      ]);
    },
    onError: (e: any) => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Не удалось получить ответ: ${e?.message ?? "ошибка сервера"}`,
          links: [],
        },
      ]);
    },
  });

  function send(question: string) {
    const text = question.trim();
    if (!text || mutation.isPending) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    mutation.mutate(text);
  }

  // Вопрос из строки поиска в шапке приходит как ?q= — задаём его один раз.
  useEffect(() => {
    if (q && askedRef.current !== q) {
      askedRef.current = q;
      send(q);
      navigate({ to: "/ai", search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, mutation.isPending]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Помощник"
        description="Задайте вопрос по данным программы — ответ со ссылками на источники. Переписка сохраняется."
        action={
          messages.length > 0 ? (
            <ConfirmButton
              variant="outline"
              size="sm"
              destructive
              title="Очистить переписку?"
              description="История вопросов и ответов будет удалена без возможности восстановления."
              confirmText="Очистить"
              onConfirm={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Очистить
            </ConfirmButton>
          ) : undefined
        }
      />

      <Card className="p-3 sm:p-4 space-y-3 min-h-[50vh] flex flex-col">
        <div className="flex-1 space-y-3">
          {historyLoading && messages.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаю переписку…
            </div>
          )}
          {!historyLoading && messages.length === 0 && (
            <div className="text-sm text-muted-foreground space-y-3 py-6">
              <p>Спросите о долгах, доходах, договорах или занятости. Например:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((e) => (
                  <Button key={e} variant="outline" size="sm" onClick={() => send(e)}>
                    {e}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="flex items-start gap-2 max-w-[85%]">
                  <div className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm break-words">
                    {m.text}
                  </div>
                  <User className="h-4 w-4 mt-2 shrink-0 text-muted-foreground" />
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2">
                <Bot className="h-4 w-4 mt-2 shrink-0 text-primary" />
                <div className="max-w-[85%] space-y-2">
                  <div className="rounded-lg bg-muted px-3 py-2 text-sm break-words">{m.text}</div>
                  {m.degraded && (
                    <Badge variant="secondary" className="text-[10px]">
                      Ответ по данным без модели
                    </Badge>
                  )}
                  {/* Цифры считает код: показываем их отдельно, чтобы ответ модели можно было проверить. */}
                  {m.facts && m.facts !== m.text && (
                    <details className="text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer select-none hover:text-foreground">
                        Данные, по которым составлен ответ
                      </summary>
                      <p className="mt-1 rounded border border-dashed px-2 py-1.5 leading-relaxed">
                        {m.facts}
                      </p>
                    </details>
                  )}
                  {m.links.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Источники
                      </div>
                      <div className="flex flex-col gap-1">
                        {m.links.map((l, j) => (
                          <SourceLink key={j} link={l} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {mutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Считаю по данным…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Например: сколько должен ИТК Авто?"
            disabled={mutation.isPending}
          />
          <Button type="submit" disabled={mutation.isPending || !input.trim()}>
            <CornerDownLeft className="h-4 w-4" />
            <span className="sr-only">Отправить</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}

/** Ссылку строит сервер из реальных записей, поэтому она всегда ведёт к источнику числа. */
function SourceLink({ link }: { link: AiLink }) {
  return (
    <Link
      // Пути приходят с сервера строками — типизированные маршруты здесь недоступны.
      to={link.to as never}
      params={link.params as never}
      search={link.search as never}
      className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-sm hover:border-primary hover:bg-accent/40"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{link.label}</span>
      </span>
      {link.note && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{link.note}</span>
      )}
    </Link>
  );
}
