/** Миниатюра вложения из чата: серый плейсхолдер, пока ссылка не подписана. */
import { Image as ImageIcon } from "lucide-react";
import { useSignedUrl } from "@/lib/use-signed-url";
import { cn } from "@/lib/utils";

export function AttachmentThumb({
  path,
  className,
  alt,
}: {
  path: string;
  /** Размерные классы (например, "h-14 w-14" или "h-20 w-full"). */
  className: string;
  alt: string;
}) {
  const url = useSignedUrl("chat-attachments", path);
  if (!url) {
    return (
      <div className={cn(className, "rounded bg-muted flex items-center justify-center")}>
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return <img src={url} alt={alt} className={cn(className, "rounded object-cover")} />;
}
