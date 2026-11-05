import { describe, expect, it } from "vitest";
import { productImageStoragePath } from "./product-image";

describe("productImageStoragePath", () => {
  it("obtiene solamente el path de una imagen pública del bucket configurado", () => {
    expect(
      productImageStoragePath(
        "https://project.supabase.co/storage/v1/object/public/imagenes-producto/lacteos/leche%20entera.jpg",
        "https://project.supabase.co",
        "imagenes-producto",
      ),
    ).toBe("lacteos/leche entera.jpg");
  });

  it("no intenta borrar URLs fuera del bucket configurado", () => {
    expect(
      productImageStoragePath(
        "https://project.supabase.co/storage/v1/object/public/otro-bucket/lacteos/leche.jpg",
        "https://project.supabase.co",
        "imagenes-producto",
      ),
    ).toBeNull();
    expect(
      productImageStoragePath(
        "https://otro.example/storage/v1/object/public/imagenes-producto/lacteos/leche.jpg",
        "https://project.supabase.co",
        "imagenes-producto",
      ),
    ).toBeNull();
  });
});
