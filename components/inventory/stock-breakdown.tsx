import { stockBreakdown } from "@/lib/presentations";

export function StockBreakdown({
  stock,
  presentations,
}: {
  stock: number;
  presentations: { name: string; unitsPerPresentation: number }[];
}) {
  const biggest = [...presentations].sort(
    (a, b) => b.unitsPerPresentation - a.unitsPerPresentation,
  )[0];
  if (!biggest || biggest.unitsPerPresentation < 2) return null;
  const { packages, loose } = stockBreakdown(stock, biggest.unitsPerPresentation);
  const name = biggest.name.toLowerCase();
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {packages} {name}
      {packages === 1 ? "" : "s"} y {loose} {loose === 1 ? "suelta" : "sueltas"}
    </p>
  );
}
