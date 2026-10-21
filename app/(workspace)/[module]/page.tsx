import { notFound } from "next/navigation";
import { BarChart3, FileText, HandCoins, Tags, Truck, Users, Boxes } from "lucide-react";
import { ModulePlaceholder } from "@/components/workspace/module-placeholder";
const modules = {
  compras: { title: "Compras y abastecimiento", intro: "Registra las entradas de mercadería y consulta cuánto compraste, cuándo llegó y qué productos reforzaste.", benefits: ["Historial de recepciones por proveedor", "Entrada de unidades conectada al inventario", "Costos de compra para comparar reposiciones"], icon: Boxes },
  proveedores: { title: "Proveedores", intro: "Ten a mano contactos, condiciones de entrega y el historial de abastecimiento de cada proveedor.", benefits: ["Ficha con teléfono, notas y condiciones", "Últimas compras y montos asociados", "Historial conservado aunque cambie el proveedor"], icon: Truck },
  "comparar-precios": { title: "Comparativa de precios", intro: "Compara cuánto cuesta reponer cada artículo con distintos proveedores antes de elegir dónde comprar.", benefits: ["Precios por producto y proveedor", "Identificación rápida de la mejor alternativa", "Registro de cuándo se actualizó cada cotización"], icon: Tags },
  clientes: { title: "Clientes", intro: "Organiza los datos de tus clientes y consulta su actividad para dar seguimiento a quienes compran en tu negocio.", benefits: ["Fichas de contacto ordenadas", "Historial de compras por cliente", "Base lista para futuras ventas a crédito"], icon: Users },
  reportes: { title: "Reportes del negocio", intro: "Convierte las ventas, las existencias y las compras en resúmenes sencillos para decidir qué hacer después.", benefits: ["Ventas por período y categoría", "Productos con más movimiento", "Resumen de inventario y reposición"], icon: BarChart3 },
  dte: { title: "Facturación electrónica DTE", intro: "La emisión electrónica queda como una opción aparte: el inventario y el punto de venta funcionan sin activarla.", benefits: ["Preparación para conectar el servicio de emisión", "Conservación y consulta de documentos emitidos", "Se habilitará cuando decidas formalizar y usar DTE"], icon: FileText },
  "precio-sugerido": { title: "Precio sugerido", intro: "Analiza costos y márgenes para ayudarte a definir precios sostenibles para los productos de tu catálogo.", benefits: ["Margen esperado por artículo", "Comparación entre costo y precio actual", "Sugerencias sencillas para revisar antes de aplicar"], icon: HandCoins },
} satisfies Record<string, { title: string; intro: string; benefits: string[]; icon: typeof Boxes }>;
export default async function PlaceholderPage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!(module in modules)) notFound();
  const content = modules[module as keyof typeof modules];
  return <ModulePlaceholder {...content} />;
}