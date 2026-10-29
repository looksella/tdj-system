// Browser-side Supabase Storage upload helper. It never reads secrets.
export interface SubidaFirmada {
  path: string;
  uploadUrl: string;
}
export interface OpcionesSubida {
  /** Progreso 0-100 del archivo en curso (para una barra o un porcentaje). */
  onProgress?: (porcentaje: number) => void;
  /** Cancelación opcional. */
  signal?: AbortSignal;
}
/**
 * Sube `archivo` a `uploadUrl` (la `SubidaFirmada.uploadUrl` que devolvió el
 * server). Resuelve cuando el bucket confirmó la escritura; lanza con el
 * mensaje del bucket si falló. Recién después de que resuelva registrá el
 * `path` en la base con otro Server Action.
 */
export async function subirArchivoFirmado(
  archivo: File | Blob,
  uploadUrl: string,
  opts: OpcionesSubida = {},
): Promise<void> {
  const tipo = (archivo as File).type || "application/octet-stream";
  if (typeof XMLHttpRequest === "undefined") {
    // Sin XHR (tests, scripts): PUT plano, sin progreso.
    const res = await fetch(uploadUrl, {
      method: "PUT",
      body: archivo,
      headers: { "Content-Type": tipo },
      signal: opts.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`No se pudo subir el archivo (${res.status}): ${detail.slice(0, 200)}`);
    }
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", tipo);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `No se pudo subir el archivo (${xhr.status}): ${String(xhr.responseText ?? "").slice(0, 200)}`,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error("No se pudo subir el archivo: fallo de red."));
    xhr.onabort = () => reject(new Error("Subida cancelada."));
    if (opts.signal) {
      if (opts.signal.aborted) xhr.abort();
      else opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(archivo);
  });
}
/**
 * Sube varios archivos de a uno y devuelve los paths en el mismo orden.
 * `pedirSubida` es el Server Action de la app que valida y devuelve la
 * `SubidaFirmada` de cada archivo (ver lib/beon-storage.ts). Si uno falla,
 * lanza con ese error; los ya subidos quedan en el bucket sin registrar,
 * así que registrá los paths en la base recién cuando esta promesa resuelva.
 */
export async function subirArchivos(
  archivos: File[],
  pedirSubida: (nombre: string, tipo: string, tamano: number) => Promise<SubidaFirmada>,
  opts: OpcionesSubida & { onArchivo?: (indice: number, total: number) => void } = {},
): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < archivos.length; i++) {
    const f = archivos[i];
    opts.onArchivo?.(i, archivos.length);
    const firmada = await pedirSubida(f.name, f.type, f.size);
    await subirArchivoFirmado(f, firmada.uploadUrl, opts);
    paths.push(firmada.path);
  }
  return paths;
}
