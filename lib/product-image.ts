export function productImageStoragePath(
  imageUrl: string,
  storageOrigin: string,
  bucket: string,
): string | null {
  if (!storageOrigin || !bucket) return null;
  try {
    const image = new URL(imageUrl);
    const origin = new URL(storageOrigin);
    const prefix = `/storage/v1/object/public/${encodeURIComponent(bucket)}/`;
    if (image.origin !== origin.origin || !image.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(image.pathname.slice(prefix.length));
    return path && !path.split("/").some((segment) => segment === "." || segment === "..")
      ? path
      : null;
  } catch {
    return null;
  }
}
