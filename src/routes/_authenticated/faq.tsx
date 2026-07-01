import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GraduationCap, HelpCircle, Send } from "lucide-react";
import { useDemoIdentity } from "@/lib/demo-identity";
import { replayOnboarding } from "@/components/onboarding-quest";
import { submitFeedback } from "@/lib/feedback.functions";

export const Route = createFileRoute("/_authenticated/faq")({
  component: FaqPage,
});

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "С чего начать работу?",
    a: "Пройдите «Первичное обучение» на главной: создайте объект, заведите арендатора и оформите договор. Обучение можно запустить заново кнопкой ниже.",
  },
  {
    q: "Как добавить объект, арендатора и договор?",
    a: "В левом меню: «Объекты» → «Добавить», «Арендаторы» → «Добавить», «Договоры» → «Новый договор». В договоре свяжите объект и арендатора и укажите ставку и период.",
  },
  {
    q: "Как работает чат и задачи?",
    a: "В разделе «Чаты» вы переписываетесь с арендаторами. Из сообщений с фото ИИ автоматически предлагает задачи — они появляются в разделе «Задачи».",
  },
  {
    q: "Что означает BETA в версии?",
    a: "Приложение в стадии беты (версия 0.x): возможны изменения. Текущая версия указана внизу страницы.",
  },
  {
    q: "Как связаться с поддержкой?",
    a: "Через форму «Обратная связь» ниже, либо по контактам разработчика внизу страницы (Телеграм, e-mail, телефон).",
  },
];

function FaqPage() {
  const navigate = useNavigate();
  const { role } = useDemoIdentity();
  const send = useServerFn(submitFeedback);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const onReplay = async () => {
    setReplaying(true);
    try {
      await replayOnboarding();
      toast.success("Обучение запущено заново");
      navigate({ to: role === "tenant" ? "/me" : "/dashboard" });
    } finally {
      setReplaying(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 3) {
      toast.error("Напишите вопрос подробнее");
      return;
    }
    setSending(true);
    try {
      const res = await send({ data: { message: text } });
      if (res.delivered) {
        toast.success("Вопрос отправлен разработчику. Спасибо!");
      } else {
        toast.success("Вопрос принят — мы свяжемся с вами.");
      }
      setMessage("");
    } catch (err: any) {
      toast.error(err?.message ?? "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <HelpCircle className="h-6 w-6 text-primary" />
          FAQ и помощь
        </h1>
        <p className="text-sm text-muted-foreground">
          Ответы на частые вопросы, повтор обучения и связь с разработчиком.
        </p>
      </div>

      {/* Replay onboarding tile */}
      <Card className="border-primary/30">
        <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">Пройти обучение заново</div>
              <div className="text-xs text-muted-foreground">
                Снова показать «Первичное обучение» с шагами по основам приложения.
              </div>
            </div>
          </div>
          <Button onClick={onReplay} disabled={replaying} className="w-full sm:w-auto">
            {replaying ? "Запуск…" : "Пройти заново"}
          </Button>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Частые вопросы</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Feedback form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Обратная связь и вопросы</CardTitle>
          <p className="text-xs text-muted-foreground">
            Опишите вопрос или проблему — он придёт разработчику вместе с вашим e-mail для ответа.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <Textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ваш вопрос или предложение…"
              required
              minLength={3}
              maxLength={5000}
            />
            <Button type="submit" disabled={sending} className="w-full sm:w-auto">
              <Send className="mr-1 h-4 w-4" />
              {sending ? "Отправка…" : "Отправить вопрос"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
