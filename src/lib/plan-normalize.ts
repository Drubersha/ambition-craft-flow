/**
 * Convert any supported file (PDF, PNG, JPG, WEBP) into a single PNG Blob.
 * Used so the app stores and renders one universal format.
 */

const MAX_SIDE = 4096;

export async function normalizeToPng(file: File): Promise<{ blob: Blob; filename: string }> {
  if (file.type === "application/pdf") {
    const blob = await pdfFirstPageToPng(file);
    return { blob, filename: stripExt(file.name) + ".png" };
  }
  if (file.type.startsWith("image/")) {
    const blob = await imageToPng(file);
    return { blob, filename: stripExt(file.name) + ".png" };
  }
  throw new Error("Неподдерживаемый тип файла");
}

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "") || "plan";
}

async function imageToPng(file: File): Promise<Blob> {
  // Decode with EXIF orientation honored when supported.
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
  } catch {
    bitmap = await createImageBitmap(file);
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return await canvasToBlob(canvas);
}

/**
 * Полифилл Promise.withResolvers (ES2024): pdf.js v4 требует его и в основном
 * потоке, и внутри своего воркера, а в браузерах старее Chrome 119 /
 * Safari 17.4 его нет — загрузка PDF-плана падала с
 * «withResolvers is not a function».
 */
const WITH_RESOLVERS_POLYFILL = `Promise.withResolvers ||
  (Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  });`;

const PromiseAny = Promise as any;
/** Запоминаем ДО полифилла: если API родной, воркер можно грузить напрямую. */
const NATIVE_WITH_RESOLVERS = typeof PromiseAny.withResolvers === "function";
if (typeof PromiseAny.withResolvers !== "function") {
  PromiseAny.withResolvers = function () {
    let resolve: (v: unknown) => void;
    let reject: (e: unknown) => void;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
}

let pdfWorkerPort: Worker | null = null;
/** Воркер молча умер — на следующей попытке рендерим без него. */
let pdfWorkerBroken = false;

/** Воркер pdf.js, стартующий с полифилла (bootstrap-модуль в Blob). */
function createPdfWorker(workerUrl: string): Worker | null {
  try {
    const abs = new URL(workerUrl, window.location.href).href;
    const bootstrap = new Blob(
      [`${WITH_RESOLVERS_POLYFILL}\nawait import(${JSON.stringify(abs)});`],
      { type: "text/javascript" },
    );
    const worker = new Worker(URL.createObjectURL(bootstrap), { type: "module" });
    // Без этого сбой воркера не виден: pdf.js просто ждёт ответа вечно.
    worker.onerror = () => {
      pdfWorkerBroken = true;
    };
    return worker;
  } catch {
    return null;
  }
}

/**
 * Ограничивает ожидание: pdf.js при несовместимом браузере или битом файле не
 * отклоняет промис, а молча ждёт ответа воркера — пользователь видел вечный
 * индикатор загрузки вместо сообщения об ошибке.
 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const PDF_TIMEOUT_MS = 45_000;
const PDF_HELP =
  "Не удалось обработать PDF: браузер не справился с файлом. " +
  "Попробуйте обновить браузер или загрузить план картинкой (PNG или JPG).";

async function pdfFirstPageToPng(file: File): Promise<Blob> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;

  // Bootstrap-воркер с полифиллом нужен только там, где нет родного
  // Promise.withResolvers; в остальных браузерах — штатный путь pdf.js.
  if (pdfWorkerBroken) {
    pdfWorkerPort = null;
    pdfjs.GlobalWorkerOptions.workerPort = null;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } else if (NATIVE_WITH_RESOLVERS) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } else {
    if (!pdfWorkerPort) pdfWorkerPort = createPdfWorker(workerUrl);
    if (pdfWorkerPort) pdfjs.GlobalWorkerOptions.workerPort = pdfWorkerPort;
    else pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  const data = await file.arrayBuffer();
  const pdf: any = await withTimeout<any>(
    pdfjs.getDocument({ data, isEvalSupported: false }).promise,
    PDF_TIMEOUT_MS,
    PDF_HELP,
  );
  const page: any = await withTimeout<any>(pdf.getPage(1), PDF_TIMEOUT_MS, PDF_HELP);
  // Render at scale 2 for crisp zoom; clamp to MAX_SIDE.
  let viewport = page.getViewport({ scale: 2 });
  const maxSide = Math.max(viewport.width, viewport.height);
  if (maxSide > MAX_SIDE) {
    viewport = page.getViewport({ scale: (2 * MAX_SIDE) / maxSide });
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  await withTimeout(
    page.render({ canvasContext: ctx, viewport, canvas }).promise,
    PDF_TIMEOUT_MS,
    PDF_HELP,
  );
  await pdf.cleanup?.();
  return await canvasToBlob(canvas);
}

function fitWithin(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  // toBlob на больших холстах может не вызвать колбэк при нехватке памяти —
  // ограничиваем ожидание, чтобы загрузка не зависла без объяснения.
  return withTimeout(
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Не удалось создать PNG"))),
        "image/png",
      ),
    ),
    30_000,
    "Не удалось сохранить изображение плана: файл слишком большой для браузера.",
  );
}
