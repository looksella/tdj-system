"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { setFeature, type FeatureAdminRow } from "@/lib/actions/configuracion";
import { cn } from "@/lib/utils";

export function FeaturesPanel({ features }: { features: FeatureAdminRow[] }) {
  const [states, setStates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(features.map((feature) => [feature.key, feature.enabled])),
  );
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const groups = features.reduce<Record<string, FeatureAdminRow[]>>((acc, feature) => {
    acc[feature.group] = [...(acc[feature.group] ?? []), feature];
    return acc;
  }, {});

  function apply(
    feature: FeatureAdminRow,
    next: boolean,
    previous: boolean,
    isUndo = false,
  ) {
    setStates((current) => ({ ...current, [feature.key]: next }));
    setBusyKey(feature.key);

    startTransition(async () => {
      const result = await setFeature(feature.key, next);
      setBusyKey(null);
      if (!result.ok) {
        setStates((current) => ({ ...current, [feature.key]: previous }));
        toast.error(result.message);
        return;
      }
      if (isUndo) {
        toast.success(`${feature.label} volvió a quedar ${previous ? "activa" : "apagada"}.`);
        return;
      }
      toast.success(result.message, {
        action: {
          label: "Deshacer",
          onClick: () => apply(feature, previous, next, true),
        },
      });
    });
  }

  function toggle(feature: FeatureAdminRow, next: boolean) {
    if (busyKey) return;
    if (!next && feature.dependentLabels.length > 0) {
      const ok = window.confirm(
        `Al apagar ${feature.label} también quedan apagadas: ${feature.dependentLabels.join(", ")}. Los datos no se borran. ¿Continuar?`,
      );
      if (!ok) return;
    }

    apply(feature, next, states[feature.key]);
  }

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([group, groupFeatures]) => (
        <section key={group} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold capitalize">{group}</h2>
            <Badge variant="outline">{groupFeatures.length}</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groupFeatures.map((feature) => {
              const enabled = states[feature.key] ?? feature.enabled;
              const blockedBy = feature.dependsOn.filter((dependency) => !states[dependency]);
              const isCore = feature.kind === "core";

              return (
                <Card
                  key={feature.key}
                  className={cn("panel-shadow border-border/80", !enabled && "bg-muted/20")}
                >
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base leading-5">{feature.label}</CardTitle>
                      <div className="flex shrink-0 items-center gap-2">
                        {isCore && <Badge variant="secondary">Esencial</Badge>}
                        <Badge variant={enabled ? "secondary" : "outline"}>
                          {enabled ? "Activa" : "Apagada"}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        {isCore
                          ? "Siempre disponible"
                          : feature.defaultEnabled
                            ? "Activa por defecto"
                            : "Apagada por defecto"}
                      </span>
                      <Switch
                        checked={enabled}
                        disabled={isCore || pending || Boolean(busyKey) || blockedBy.length > 0}
                        onCheckedChange={(next) => toggle(feature, next)}
                        aria-label={
                          isCore
                            ? `${feature.label} es esencial`
                            : `${enabled ? "Apagar" : "Encender"} ${feature.label}`
                        }
                      />
                    </div>

                    {blockedBy.length > 0 && (
                      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                        Requiere: {feature.dependencyLabels.join(", ")}.
                      </p>
                    )}

                    {!blockedBy.length && feature.dependencyLabels.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Requiere: {feature.dependencyLabels.join(", ")}.
                      </p>
                    )}

                    {enabled && feature.dependentLabels.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Dependen de esta: {feature.dependentLabels.join(", ")}.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
