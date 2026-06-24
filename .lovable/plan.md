Add a total-expense summary row below the "Структура операционных расходов" pie chart.

1. Modify `src/routes/_authenticated/dashboard.tsx` in the `BudgetExpenseStructure` component.
2. After the existing `ResponsiveContainer`/PieChart block (when there is data), render a compact footer row inside the same `CardContent`:
   - Label: "Всего расходов за месяц"
   - Value: `formatMoney(total)` where `total` is the sum of the current-month `budget_expenses` already computed for the chart.
   - Style: muted label + bold value, separated by a divider or small margin, centered or left-aligned under the chart.
3. Keep the existing empty state ("Нет расходов за текущий месяц.") and loading state unchanged.
4. No database or server changes are needed — the total is derived from the same data already fetched for the chart.

Технические детали:
- Переменная `total` уже вычисляется в `BudgetExpenseStructure` на строке `const total = slices.reduce(...)`.
- Добавить строку с `<div className="...">` сразу после закрывающего `</div>` диаграммы, внутри того же условия `slices.length === 0 ? ... : (...)`.
- Использовать существующий `formatMoney` из `@/lib/format`.
- Поддержать темную тему: использовать `text-muted-foreground` для подписи и `text-foreground` / `font-bold` для суммы.