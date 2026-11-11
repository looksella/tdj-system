"use client";
import { useState } from "react";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/locale";
import { dollarsToCents } from "@/lib/pricing";

export function DiscountPopover({
  name,
  subtotalCents,
  discountCents,
  onApply,
}: {
  name: string;
  subtotalCents: number;
  discountCents: number;
  onApply: (cents: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const empty = value.trim() === "";
  const parsed = empty ? null : dollarsToCents(value);
  const invalid = !empty && parsed === null;
  const tooBig = parsed !== null && parsed > subtotalCents;
  const canApply = parsed !== null && parsed > 0 && !tooBig;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(discountCents > 0 ? (discountCents / 100).toFixed(2) : "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={discountCents > 0 ? "secondary" : "ghost"}
          size="icon-xs"
          aria-label={`Descuento para ${name}`}
        >
          <Tag />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div>
          <p className="text-sm font-semibold">Descuento</p>
          <p className="text-xs text-muted-foreground">
            Subtotal de la línea: {formatMoney(subtotalCents / 100)}
          </p>
        </div>
        <Input
          inputMode="decimal"
          placeholder="0.00"
          aria-label="Descuento en dólares"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-10"
        />
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {invalid
            ? "Ingresa un monto válido, con máximo 2 decimales."
            : tooBig
              ? `El descuento no puede ser mayor al subtotal (${formatMoney(subtotalCents / 100)}).`
              : parsed
                ? `−${formatMoney(parsed / 100)} → ${formatMoney((subtotalCents - parsed) / 100)}`
                : "Escribe cuánto quieres rebajar."}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={!canApply}
            onClick={() => {
              onApply(parsed!);
              setOpen(false);
            }}
          >
            Aplicar
          </Button>
          {discountCents > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onApply(0);
                setOpen(false);
              }}
            >
              Quitar
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}