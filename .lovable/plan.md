## Цель

Единый формат хранения планов (PNG) и универсальный просмотрщик с зумом/панорамированием, работающий одинаково для всех загружаемых файлов (PDF, JPG, PNG, WEBP).

## Подход

**Конвертация на клиенте при загрузке.** Любой загружаемый файл превращается в один PNG перед отправкой в Storage. Это решает проблему `ERR_BLOCKED_BY_CLIENT` на iframe с PDF (блокировщики режут PDF-вьюверы) и даёт один универсальный путь рендера.

- PDF → рендер первой страницы через `pdfjs-dist` в `<canvas>` → `toBlob('image/png')`.
- JPG/PNG/WEBP → нормализуются в PNG тем же путём через `<img>` + `<canvas>` (единый mime, единое поведение, EXIF-ориентация сбрасывается).
- В хранилище всегда `image/png`, расширение `.png`. Поле `plan_mime` становится фактически справочным (`image/png`).

> Для многостраничных PDF берём первую страницу — план территории/объекта это обычно один лист. Если позднее понадобится несколько страниц, можно добавить выбор страницы.

## Универсальный просмотрщик `PlanViewer`

Новый компонент `src/components/plan-viewer.tsx`:

- Контейнер фиксированной высоты (`h-[480px]`) с `overflow: hidden`.
- Изображение трансформируется через `transform: translate(x,y) scale(s)` (GPU-ускорено, плавно).
- Управление:
  - колесо мыши → zoom к курсору,
  - pinch на тач-устройствах → zoom,
  - drag мышью / one-finger pan → перемещение,
  - двойной клик → toggle 1× / 2×,
  - кнопки: `+`, `−`, `Сбросить` (fit), `Во весь экран` (Dialog с тем же вьюером на всё окно),
  - ссылка «Открыть в новой вкладке» — на signed URL картинки.
- Границы зума: 0.25× … 8×, начальное состояние — «fit to container».
- Доступность: `role="img"`, `aria-label`, поддержка клавиш `+`/`−`/`0`.

Используется в `PlanUploader` (после загрузки) и везде, где отображается план: страница папки, карточка объекта.

## Изменения по файлам

1. **`src/lib/plan-normalize.ts`** (новый)
   - `normalizeToPng(file: File): Promise<{ blob: Blob; filename: string }>`.
   - Внутри: ветка для `application/pdf` (pdfjs) и ветка для image/*.
   - Лимиты: max сторона результата 4096px (downscale при превышении), JPEG-источники с EXIF корректно ориентируются.

2. **`src/components/plan-uploader.tsx`** (правка)
   - В `handleFile` сначала вызывается `normalizeToPng`, далее загружается полученный PNG (`contentType: 'image/png'`, имя `<timestamp>_plan.png`).
   - `accept` остаётся `image/png,image/jpeg,image/webp,application/pdf` (пользователю удобно), но в Storage всегда PNG.
   - Превью заменяется на `<PlanViewer src={signedUrl} />`. Ветка `isPdf` удаляется.
   - Индикатор «Конвертация…» во время нормализации (особенно PDF — может занять 1–3 сек).

3. **`src/components/plan-viewer.tsx`** (новый) — описан выше.

4. **`package.json`** — добавить `pdfjs-dist` (используем legacy build для совместимости с Vite + worker через `?url`).

5. **Точки использования просмотрщика** — заменить любые прямые `<img>`/`<iframe>` плана на `<PlanViewer>`:
   - страница папки (`folders.tsx`) — уже через `PlanUploader`, изменений не требует;
   - детальная страница объекта (`properties.$id.tsx`) — если там есть отдельный показ плана объекта без аплоадера, переключить на `PlanViewer` (проверим при реализации).

## Технические детали

- pdfjs воркер: `import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'; GlobalWorkerOptions.workerSrc = workerSrc;` — Vite корректно эмитит файл, работает в SSR-safe виде (импорт выполняется только в браузере внутри `normalizeToPng`).
- Рендер PDF: `getDocument({ data: await file.arrayBuffer() }).promise → page = await pdf.getPage(1) → viewport(scale=2) → canvas → toBlob('image/png', 0.92)`. Scale=2 даёт чёткость при последующем зуме.
- Image-ветка: `createImageBitmap(file, { imageOrientation: 'from-image' })` → нарисовать на canvas нужного размера → `toBlob('image/png')`. Fallback на `<img>.decode()` для браузеров без `imageOrientation`.
- Существующие PDF-файлы в Storage остаются доступны (signed URL открывается по «Открыть в новой вкладке»); миграция старых файлов не требуется. При следующей замене файла он сохранится уже как PNG.
- Старое поле `plan_mime` сохраняется как есть (БД не меняем).

## Что НЕ делаем

- Не трогаем БД и RLS — формат хранения остаётся в том же бакете `documents`, по тем же путям.
- Не делаем серверную конвертацию (Worker-runtime запрещает `sharp`/`canvas` нативно; клиентская конвертация полностью покрывает кейс).
- Многостраничные PDF: пока берём только первую страницу.
