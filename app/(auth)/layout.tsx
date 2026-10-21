/**
 * Layout del grupo `(auth)`: full-screen, minimal, SIN guard y SIN sidebar.
 * Las pantallas de auth se ven cuando NO hay sesión, así que un guard acá
 * dejaría al usuario sin poder llegar al login.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      {children}
    </div>
  );
}