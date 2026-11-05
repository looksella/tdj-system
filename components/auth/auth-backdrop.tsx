import Image from "next/image";

/**
 * Fondo del login: la foto del rancho al atardecer, fija y detrás de todo.
 *
 * Claro: foto natural + degradado crema que aclara la base para que la
 * tarjeta se lea. Oscuro: la misma foto atenuada, overlay verde profundo y un
 * resplandor ámbar sobre el sol para que parezca atardecer nocturno.
 *
 * `object-[72%_center]` mantiene el sol en cuadro también a 360 px, donde
 * `object-cover` recorta los costados.
 */
export function AuthBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden bg-[#FBF8F1] dark:bg-[#04120C]"
    >
      <Image
        src="/fondo-rancho.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[72%_center] dark:brightness-[0.35] dark:saturate-[0.8]"
      />

      {/* Claro: crema al 70% abajo, transparente arriba. */}
      <div className="absolute inset-0 bg-linear-to-t from-[#FBF8F1]/70 via-[#FBF8F1]/15 to-transparent dark:hidden" />

      {/* Oscuro: verde muy oscuro arriba → negro azulado abajo. */}
      <div className="absolute inset-0 hidden bg-linear-to-b from-[#04120C]/85 via-[#04120C]/75 to-[#0B1220] dark:block" />

      {/* El sol sigue brillando de noche. */}
      <div
        className="tdj-sun absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(circle at 72% 42%, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0) 45%)",
        }}
      />
    </div>
  );
}
