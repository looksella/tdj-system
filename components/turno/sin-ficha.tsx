import Link from "next/link";
import { UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Lo que ve un empleado cuya cuenta todavía no está ligada a una ficha del
 * equipo. Sin correo registrado en Planilla no hay a quién atribuir el turno,
 * y adivinar sería peor que decir que falta un paso.
 */
export function SinFicha({ que }: { que: string }) {
  return (
    <Card className="panel-shadow border-border/80">
      <CardContent className="flex flex-col items-center px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
          <UserRoundCog className="size-5" />
        </span>
        <h1 className="display-heading mt-4 text-xl font-bold">Falta vincular tu cuenta</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Tu usuario todavía no tiene una ficha del equipo, así que no podemos
          registrar {que} a tu nombre. Pedile al administrador que agregue tu
          correo en Planilla → Personas y condiciones.
        </p>
        <Button asChild variant="outline" className="mt-5 rounded-xl">
          <Link href="/ventas">Ir al punto de venta</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
