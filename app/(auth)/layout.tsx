/**
 * Layout del grupo `(auth)`: full-screen, minimal, SIN guard y SIN sidebar.
 * Las pantallas de auth se ven cuando NO hay sesión, así que un guard acá
 * dejaría al usuario sin poder llegar al login.
 */
// Next can attach the per-request CSP nonce only to dynamically rendered HTML.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Sin `bg-background`: el login monta una foto fija con `-z-10` y un fondo
  // opaco acá la taparía. El body ya pinta el color de fondo del sistema.
  return <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">{children}</div>;
}
