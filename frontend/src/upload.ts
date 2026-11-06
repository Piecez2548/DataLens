// Text files are compressed in the browser before upload so that larger files fit the hosting request limit.
export const MAX_TEXT_MB = 40;
export const MAX_UPLOAD_MB = import.meta.env.PROD ? 4 : 10;
const COMPRESS_FROM_BYTES = 512 * 1024;
const isText = (name: string) => /\.(csv|json|jsonl|ndjson)$/i.test(name);

export const allowedFile = (file: File) => {
  if (!/\.(csv|xlsx|json|jsonl|ndjson)$/i.test(file.name)) return false;
  const limit = isText(file.name) && typeof CompressionStream !== "undefined" ? MAX_TEXT_MB : MAX_UPLOAD_MB;
  return file.size <= limit * 1024 * 1024;
};

/** Returns the file to send: gzip-compressed (name.csv.gz) when that helps, otherwise the file itself. */
export async function prepareUpload(file: File): Promise<File> {
  if (isText(file.name) && file.size > COMPRESS_FROM_BYTES && typeof CompressionStream !== "undefined") {
    const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
    const body = await new Response(stream).blob();
    return new File([body], `${file.name}.gz`, { type: "application/gzip" });
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`Choose a CSV, XLSX or JSON file no larger than ${MAX_UPLOAD_MB} MB.`);
  }
  return file;
}

export function checkSentSize(file: File) {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`This file is still larger than ${MAX_UPLOAD_MB} MB after compression. Remove columns or split it.`);
  }
}

/** POST with real upload progress (fetch cannot report it). Resolves to a Response so callers stay unchanged. */
export function postWithProgress(url: string, body: FormData, onProgress: (percent: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      onProgress(100);
      if (xhr.status < 200 || xhr.status > 599) reject(new TypeError("Network error"));
      else resolve(new Response(xhr.responseText, { status: xhr.status }));
    };
    xhr.onerror = () => reject(new TypeError("Network error"));
    xhr.onabort = () => reject(new TypeError("Network error"));
    xhr.send(body);
  });
}
