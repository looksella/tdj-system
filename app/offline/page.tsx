// Inyectado por el pipeline de TuSistema.AI. Pantalla que se muestra cuando
// el usuario abre la app sin conexión.
// NO modificar — sobreescrito automáticamente en cada iteración.
//
// El service worker la cachea en el install y la sirve cuando una
// navegación falla. Tres restricciones que la hacen confiable:
//   - Estática: sin fetch, sin DB, sin cookies. Si dependiera de la red no
//     serviría justo cuando hace falta.
//   - Estilos inline: no importa nada de components/ui ni depende del
//     @theme de globals.css, así que no se rompe si el agente cambia la
//     paleta del proyecto.
//   - Server Component sin interactividad salvo el botón de recargar, que
//     es un <a> al mismo path (no necesita "use client").
export const dynamic = "force-static";
export default function OfflinePage() {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Mi sistema";
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#18181b",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: "2.5rem",
          lineHeight: 1,
        }}
        aria-hidden="true"
      >
        ⚡
      </div>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
        Sin conexión
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: "0.95rem",
          color: "#52525b",
          maxWidth: "28rem",
        }}
      >
        No pudimos conectarnos para mostrarte {name}. Revisá tu conexión y
        volvé a intentar — tus datos están a salvo en el servidor.
      </p>
      <a
        href="/"
        style={{
          marginTop: "0.5rem",
          display: "inline-block",
          padding: "0.625rem 1.25rem",
          borderRadius: "0.5rem",
          background: "#18181b",
          color: "#ffffff",
          textDecoration: "none",
          fontSize: "0.95rem",
          fontWeight: 500,
        }}
      >
        Volver a intentar
      </a>
    </div>
  );
}
