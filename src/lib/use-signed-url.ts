/**
 * Подписанная ссылка на файл в приватном storage-bucket'е.
 * null — пока ссылка не получена, путь пуст или подпись не удалась.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSignedUrl(
  bucket: string,
  path: string | null | undefined,
  expiresIn = 3600,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [bucket, path, expiresIn]);
  return url;
}
