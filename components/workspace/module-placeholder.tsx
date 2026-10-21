import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export function ModulePlaceholder({ title, intro, benefits, icon: Icon }: { title: string; intro: string; benefits: string[]; icon: LucideIcon }) {
  return (
    <div className="flex min-h-[65vh] items-center justify-center py-8">
      <Card className="panel-shadow w-full max-w-3xl overflow-hidden border-border/80">
        <div className="grid md:grid-cols-[0.85fr_1.15fr]">
          <div className="relative flex min-h-56 flex-col justify-between overflow-hidden bg-primary p-7 text-primary-foreground sm:p-9"><div className="absolute -right-10 -top-12 size-48 rounded-full border border-white/15" /><div className="relative flex size-14 items-center justify-center rounded-2xl bg-white/15"><Icon className="size-7" /></div><div className="relative"><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">Tu sistema crece contigo</p><p className="display-heading mt-2 text-3xl font-semibold">Próximamente</p></div></div>
          <CardContent className="flex flex-col justify-center p-7 sm:p-9"><p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Módulo en preparación</p><h1 className="display-heading text-3xl font-semibold">{title}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{intro}</p><div className="mt-5 space-y-3">{benefits.map((benefit) => <div key={benefit} className="flex items-start gap-2.5 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><span>{benefit}</span></div>)}</div><p className="mt-6 text-sm font-medium">Cuando quieras, pídeme este módulo en el chat y lo sumamos.</p><div className="mt-5 flex flex-wrap gap-3"><Button asChild className="rounded-xl"><Link href="/">Volver al inicio<ArrowRight /></Link></Button><Button asChild variant="outline" className="rounded-xl"><Link href="/inventario">Abrir inventario</Link></Button></div></CardContent>
        </div>
      </Card>
    </div>
  );
}
