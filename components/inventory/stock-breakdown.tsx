import { closedUnits } from "@/lib/presentations";

type Item = { name: string; unitsPerPresentation: number; closedStock: number };

function plural(word: string) {
  return /[aeiouáéíóú]$/i.test(word) ? `${word}s` : `${word}es`;
}

/** "1 caja sin abrir · 50 sueltas" a partir del total de unidades y lo que hay sin abrir. */
export function StockBreakdown({ stock, presentations }: { stock: number; presentations: Item[] }) {
  if (presentations.length === 0) return null;
  const biggestFirst = [...presentations].sort(
    (a, b) => b.unitsPerPresentation - a.unitsPerPresentation,
  );
  const closedParts = biggestFirst
    .filter((item) => item.closedStock > 0)
    .map((item) => {
      const name = item.name.toLowerCase();
      return `${item.closedStock} ${item.closedStock === 1 ? name : plural(name)} sin abrir`;
    });
  const loose =
    stock -
    closedUnits(
      biggestFirst.map((item) => ({
        id: item.name,
        unitsPerPresentation: item.unitsPerPresentation,
        closed: item.closedStock,
      })),
    );
  const looseText = `${Math.max(0, loose)} ${loose === 1 ? "suelta" : "sueltas"}`;
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {[...closedParts, looseText].join(" · ")}
    </p>
  );
}
