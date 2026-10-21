"use client";
/**
 * Pantalla de ajustes de impresión (opcional).
 *
 * Montala en la configuración de la app cuando el negocio pueda tener más de un
 * tipo de impresora. El dueño elige acá el ancho de su térmica y el tamaño de
 * sus etiquetas, y TODO lo que imprima el sistema se ajusta: los componentes
 * leen el formato de `formatoDe(familia)`, no lo tienen horneado.
 *
 * Guarda en `localStorage`: alcanza para un negocio con un mostrador. Si hay
 * varias sucursales o varias máquinas y el ajuste tiene que ser del NEGOCIO,
 * mové la elección a una tabla de configuración y pasá el formato por prop.
 */
import { useEffect, useState } from "react";
import {
  FORMATOS,
  FORMATO_POR_DEFECTO,
  guardarAjuste,
  leerAjustes,
  nombreFormato,
  type FamiliaImpresion,
  type FormatoId,
} from "./config";
const FAMILIAS: { id: FamiliaImpresion; titulo: string; ayuda: string }[] = [
  { id: "ticket", titulo: "Ticket de venta", ayuda: "El ancho del rollo de tu impresora térmica." },
  { id: "etiqueta", titulo: "Etiquetas", ayuda: "La medida de las etiquetas autoadhesivas que usás." },
  { id: "documento", titulo: "Presupuestos y remitos", ayuda: "El tamaño de hoja de tu impresora común." },
];
export function AjustesImpresion() {
  const [elegidos, setElegidos] = useState<Partial<Record<FamiliaImpresion, FormatoId>>>({});
  // `localStorage` no existe en el server: se lee después de montar para que el
  // HTML del servidor y el del cliente coincidan.
  useEffect(() => setElegidos(leerAjustes()), []);
  const cambiar = (familia: FamiliaImpresion, id: FormatoId) => {
    guardarAjuste(familia, id);
    setElegidos((prev) => ({ ...prev, [familia]: id }));
  };
  return (
    <div className="flex flex-col gap-6">
      {FAMILIAS.map((f) => {
        const opciones = (Object.keys(FORMATOS) as FormatoId[]).filter(
          (id) => FORMATOS[id].familia === f.id,
        );
        const actual = elegidos[f.id] ?? FORMATO_POR_DEFECTO[f.id];
        return (
          <div key={f.id} className="flex flex-col gap-2">
            <div>
              <p className="font-medium">{f.titulo}</p>
              <p className="text-sm text-muted-foreground">{f.ayuda}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {opciones.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => cambiar(f.id, id)}
                  aria-pressed={actual === id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    actual === id
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {nombreFormato(id)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}