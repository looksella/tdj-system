"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAuditLog } from "@/lib/actions/configuracion";

type AuditEntry = {
  id: string;
  actorId: string;
  targetUserId: string | null;
  kind: string;
  key: string;
  before: string | null;
  after: string | null;
  createdAt: Date | string;
};

type AuditPage = {
  entries: AuditEntry[];
  total: number;
  page: number;
  take: number;
};

const KIND_LABEL: Record<string, string> = {
  feature: "Herramienta",
  permission: "Permiso",
};

const KEY_LABEL: Record<string, string> = {
  __reset__: "Restablecimiento completo",
};

function shortId(value: string | null) {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function AuditPanel({ initial }: { initial: AuditPage }) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(data.total / data.take));

  function goTo(page: number) {
    if (page < 1 || page > totalPages || pending) return;
    startTransition(async () => {
      try {
        const next = await listAuditLog(page, data.take);
        setData(next as AuditPage);
      } catch {
        toast.error("No se pudo cargar el historial.");
      }
    });
  }

  return (
    <Card className="panel-shadow border-border/80">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl">Historial de cambios</CardTitle>
        <Badge variant="outline">{data.total} registros</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.entries.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Todavía no hay cambios registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>A quién</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Qué</TableHead>
                  <TableHead>Antes → después</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(entry.createdAt).toLocaleString("es-SV")}
                    </TableCell>
                    <TableCell className="text-sm">{shortId(entry.actorId)}</TableCell>
                    <TableCell className="text-sm">{shortId(entry.targetUserId)}</TableCell>
                    <TableCell className="text-sm">
                      {KIND_LABEL[entry.kind] ?? entry.kind}
                    </TableCell>
                    <TableCell className="text-sm">{KEY_LABEL[entry.key] ?? entry.key}</TableCell>
                    <TableCell className="max-w-[22rem] truncate text-sm text-muted-foreground">
                      {entry.before ?? "—"} → {entry.after ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Página {data.page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || data.page <= 1}
              onClick={() => goTo(data.page - 1)}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || data.page >= totalPages}
              onClick={() => goTo(data.page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
