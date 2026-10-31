// Server-side Supabase Storage helpers. Never import this file into client code.
export interface SubidaFirmada {
  /** Path del objeto dentro del bucket. Es lo que se guarda en la base. */
  path: string;
  /** URL absoluta a la que el navegador hace PUT con el archivo. Vence en 2 horas. */
  uploadUrl: string;
}
function env() {
  // Leídas al llamar, no al cargar el módulo (App Router resuelve por request).
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    bucket: process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}
/** Whether Supabase Storage is configured for this application. */
export function storageActivo(): boolean {
  const { url, bucket, serviceKey } = env();
  return Boolean(url && bucket && serviceKey);
}
function requerirStorage() {
  if (typeof window !== "undefined") {
    throw new Error(
      "lib/beon-storage.ts es server-side: en el navegador usá lib/beon-storage-client.ts.",
    );
  }
  const e = env();
  if (!e.url || !e.bucket || !e.serviceKey) {
    throw new Error("El almacenamiento de archivos todavía no está activado para este sistema.");
  }
  return e;
}
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
async function storageFetch(pathname: string, method: string, body: string): Promise<Response> {
  const { url, serviceKey } = requerirStorage();
  const res = await fetch(`${url}/storage/v1${pathname}`, {
    method,
    body,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Storage ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res;
}
/**
 * Arma un path seguro y único: `${carpeta}/${timestamp}-${nombre limpio}`.
 * `carpeta` agrupa por entidad (ej. `ordenes/${ordenId}`, `productos/${id}`,
 * `${userId}` si el sistema tiene login). Nunca uses el nombre original tal cual.
 */
export function pathSeguro(carpeta: string, nombreOriginal: string): string {
  const limpio =
    nombreOriginal
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(-120) || "archivo";
  const folder = carpeta.replace(/^\/+|\/+$/g, "");
  return `${folder}/${Date.now()}-${limpio}`;
}
/**
 * Emite la URL firmada para que el NAVEGADOR suba el archivo directo al bucket.
 * Llamala desde un Server Action que valide el pedido (a qué entidad va, tipo y
 * tamaño permitidos) y devolvele el resultado al cliente, que hace el PUT con
 * `subirArchivoFirmado()` / `subirArchivos()` de lib/beon-storage-client.ts.
 */
export async function crearSubidaFirmada(path: string): Promise<SubidaFirmada> {
  const { url, bucket } = requerirStorage();
  const res = await storageFetch(`/object/upload/sign/${bucket}/${encodePath(path)}`, "POST", "{}");
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Storage: la URL de subida vino vacía.");
  return { path, uploadUrl: encodeURI(`${url}/storage/v1${data.url}`) };
}
/**
 * Guarda bytes que NACEN en el server (una imagen generada por IA, un PDF
 * armado por la app). NO es para archivos que sube el usuario: esos van del
 * navegador al bucket con `crearSubidaFirmada` + lib/beon-storage-client.ts.
 */
export async function guardarDesdeServer(
  path: string,
  bytes: ArrayBuffer | Uint8Array | Blob,
  contentType = "application/octet-stream",
  overwrite = false,
): Promise<{ path: string }> {
  const { url, bucket, serviceKey } = requerirStorage();
  const body = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: contentType });
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodePath(path)}`, {
    method: "POST",
    body,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": contentType,
      "x-upsert": overwrite ? "true" : "false",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Storage ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { path };
}
/** URL firmada temporal para MOSTRAR o descargar un archivo del bucket privado. */
export async function urlFirmada(path: string, segundos = 3600): Promise<string> {
  const { url, bucket } = requerirStorage();
  const res = await storageFetch(
    `/object/sign/${bucket}/${encodePath(path)}`,
    "POST",
    JSON.stringify({ expiresIn: segundos }),
  );
  const data = (await res.json()) as { signedURL?: string };
  if (!data.signedURL) throw new Error("Storage: la URL firmada vino vacía.");
  return encodeURI(`${url}/storage/v1${data.signedURL}`);
}
/** Varias URLs firmadas en una sola llamada (listados, galerías). Devuelve path → url. */
export async function urlsFirmadas(
  paths: string[],
  segundos = 3600,
): Promise<Record<string, string>> {
  const salida: Record<string, string> = {};
  if (paths.length === 0) return salida;
  const { url, bucket } = requerirStorage();
  const res = await storageFetch(
    `/object/sign/${bucket}`,
    "POST",
    JSON.stringify({ expiresIn: segundos, paths }),
  );
  const items = (await res.json()) as Array<{
    path: string | null;
    signedURL: string | null;
    error?: string | null;
  }>;
  for (const item of items) {
    if (item.path && item.signedURL) {
      salida[item.path] = encodeURI(`${url}/storage/v1${item.signedURL}`);
    }
  }
  return salida;
}
/** Borra objetos del bucket (por ejemplo, al eliminar la fila que los referencia). */
export async function borrarArchivos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { bucket } = requerirStorage();
  await storageFetch(`/object/${bucket}`, "DELETE", JSON.stringify({ prefixes: paths }));
}
