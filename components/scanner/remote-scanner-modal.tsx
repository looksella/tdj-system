"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRemoteScannerPc } from "@/hooks/use-remote-scanner-pc";
import type { ScannedProduct } from "@/lib/actions/commerce";

type Props =
  | { mode: "inventory"; enabled: true; onFound?: never }
  | {
      mode: "pos";
      enabled: boolean;
      onFound: (product: ScannedProduct) => "ok" | "sin_stock" | Promise<"ok" | "sin_stock">;
    };

export function RemoteScannerModal(props: Props) {
  if (!props.enabled) return null;
  return <EnabledRemoteScannerModal {...props} />;
}

function EnabledRemoteScannerModal(props: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const handleFound = useCallback(
    async (product: ScannedProduct): Promise<"ok" | "sin_stock"> => {
      if (props.mode === "inventory") {
        const params = new URLSearchParams(window.location.search);
        params.set("q", product.sku);
        params.delete("page");
        router.replace(`/inventario?${params.toString()}`);
        return "ok";
      }
      return props.onFound(product);
    },
    [props, router],
  );
  const { sessionUrl, connected, unlink } = useRemoteScannerPc(handleFound);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-11 shrink-0 rounded-xl px-3 sm:px-4">
          <Smartphone aria-hidden="true" />
          <span className="text-xs sm:text-sm">Escanear</span>
          <span className="sr-only"> productos con el celular</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="display-heading text-2xl">
            Escanear productos con tu celular
          </DialogTitle>
          <DialogDescription>
            Vincula tu celular con este código QR; cada producto escaneado se agregará al carrito.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {sessionUrl ? (
            <div className="rounded-2xl border bg-white p-4">
              <QRCodeSVG value={sessionUrl} size={224} level="M" />
            </div>
          ) : (
            <div className="flex size-60 items-center justify-center rounded-2xl border bg-muted text-sm text-muted-foreground">
              Preparando sesión…
            </div>
          )}
          <Badge variant={connected ? "secondary" : "outline"} className="px-3 py-1">
            <span aria-hidden="true">{connected ? "🟢" : "🔴"}</span>
            {connected ? "Celular conectado" : "Esperando vinculación…"}
          </Badge>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={() => void unlink()}>
            <QrCode />
            Desvincular sesión
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
