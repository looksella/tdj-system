/**
 * Título del login. El texto es el de siempre; solo se resalta el nombre del
 * negocio en ámbar (oscuro en claro para no perder contraste sobre el vidrio).
 */
export function TituloBienvenida() {
  return (
    <h1 className="display-heading text-center text-2xl leading-tight font-semibold text-balance text-foreground sm:text-[1.75rem]">
      Bienvenido al Sistema de la{" "}
      <span className="whitespace-nowrap text-[#B45309] dark:text-[#FBBF24]">Tienda Don Juan</span>
    </h1>
  );
}
