// Ordena el inventario contra las ventas reales del libro de caja (Cashbook).
//
//   node --env-file=.env scripts/sincronizar-inventario.mjs                 solo simula
//   node --env-file=.env scripts/sincronizar-inventario.mjs --aplicar       respalda y escribe
//
// Qué hace: empareja los artículos vendidos con el catálogo existente, crea los
// que faltan con el precio real cobrado, desactiva (sin borrar) los productos
// que no tuvieron ninguna venta y recalcula las métricas históricas por categoría.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { readSheets } from "./xlsx-lite.mjs";

const rutaPlanilla =
  process.argv.find((arg) => arg.endsWith(".xlsx")) ??
  "C:/Users/Sella/Downloads/Cashbook_Report_29_Oct_2026_17_09_19.xlsx";
const APLICAR = process.argv.includes("--aplicar");
const HOY = new Date().toISOString().slice(0, 10);
const RESPALDO = "prisma/data/backup";

// ---------------------------------------------------------------- normalización
const sinAcentos = (texto) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const normalizar = (texto) =>
  sinAcentos(texto)
    .replace(/(\d)\s*(l|ml|lbs|lb|g|kg|oz|ud|uds|paq|doc)\b/g, "$1$2")
    .replace(/[^a-z0-9$%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cantidad vendida según la columna Observación ("3 ud", "1/2 lb", "2 paq"). */
function leerCantidad(observacion) {
  const texto = (observacion ?? "").trim().toLowerCase();
  const fraccion = /^(\d+)\s*\/\s*(\d)/.exec(texto);
  if (fraccion) return Number(fraccion[1]) / Number(fraccion[2]);
  const numero = /^(\d+(?:[.,]\d+)?)/.exec(texto);
  return numero ? Number(numero[1].replace(",", ".")) : 1;
}

const limpiarNombre = (nombre) => {
  const texto = nombre.replace(/\s+/g, " ").trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// ------------------------------------------------------------------- categorías
const CATEGORIA_POR_DEFECTO = {
  Bebidas: "Bebidas y Refrescos",
  Mascotas: "Productos para Mascotas",
  Groceries: "Alimentos Básicos y Granos",
  Food: "Alimentos Básicos y Granos",
  Desechables: "Artículos Desechables",
  Telefonica: "Telefonía y Recargas",
  Higiene: "Cuidado Personal e Higiene",
  Dulces: "Snacks y Dulces",
  Limpieza: "Productos de Limpieza del Hogar",
  Variedades: "Accesorios y Variedades",
  Helado: "Helados y Postres Congelados",
  Medicina: "Medicamentos y Farmacia",
  Jugueteria: "Juguetes y Recreación",
  Papelería: "Papelería y Material Escolar",
  Especias: "Condimentos y Especias",
  Condimentos: "Condimentos y Especias",
  Lacteos: "Lácteos y Huevos",
  Enlatados: "Enlatados y Conservas",
  "Utensilios de cocina": "Artículos para el Hogar y Utensilios",
  Neveria: "Helados y Postres Congelados",
  "": "Accesorios y Variedades",
};

const CATEGORIAS_NUEVAS = ["Telefonía y Recargas", "Juguetes y Recreación"];

// Reglas por nombre; la primera que coincide gana. Corrigen el cajón de sastre
// del cashbook ("Groceries", "Food", "Variedades") que mezcla snacks, panadería,
// café y limpieza en un solo saco.
const REGLAS = [
  [/(tarjeta (claro|tigo|movistar|digicel)|recarga|\bsaldo\b|^chips?$|simcard)/, "Telefonía y Recargas"],
  [/(pasta (liquida|de|para) (de )?zapatos|palitos? para chocobanano|pinchos? de bambu)/, "Accesorios y Variedades"],
  [/(botella|bolsa|bolson|galon) (de )?agua|agua (aqua|alpina|salud|cristal|pura)|cascada|jugo|refresco|soda|salvacola|kolashampan|\bpetit\b|aloe vera|\bamp\b|coca cola|\benergy\b|gatorade|power ade|\btang\b|superjuoo|tropical|zumo|nectar|caja salud/, "Bebidas y Refrescos"],
  [/(helado|paleta|cream pop|laky|\bcono\b|sorbete|goliat|copamia|nevecrok)/, "Helados y Postres Congelados"],
  [/(caf[eé]|coscaf|nescaf|musun|juan vald|mokaccino|coffee mate|capuchino|cremora|chocolate abuelita|\bte de|manzanilla)/, "Café e Infusiones"],
  [/(\bpan\b|pan de|panquecit|donit|mufin|muffin|semita|quesadilla|pastel|torta|marquezot|alemana|santaneca|poleadita|maria luisa|pinguinito|dalmata|bimboldraje|bimboletes|roles de canela|galleta de mantequilla|magdalena|magalena|concha|pichardin|hojita|cakito|orejita|arrollad|palmerit|tostada|rapidita|submarino|gansito|\bnito\b|sponch|principe|multigrano|chocochispa|panque|minibarrita)/, "Panadería y Repostería"],
  [/(tira |tiras |zibas|gallet|oreo|pringles|papas|papasit|chips|chetos|cheetos|ranchitas|korchip|takis|churrit|popotit|anillit|palomitas|man[ií]|ma[ií]z|chicharr|platanit|yuquit|tocinit|quesito|quesitrix|kitos|taquerit|pachangamix|yummix|yumipops|yumix|turr[oó]n|dulce|chicle|trident|clorets|menta|menthoplus|halls|bonobon|chocolat|gomita|caramelo|semilla|granola|energizante|suspiro|saladito|centavit|nacho|jalape|elotito|alboroto|totis|favori|cappy|gustit|tozteca|dorito|zambo|tortrix|chocosa|mamut|margarita|frijoli|palito|barbacoa|mashmallow|granuts|tortillita|churro|pegadit|virogrip|salero|piguis|lococha|papa lays|liquiñelos?|maiz (chino|tostado|frito)|yuca|baby diana|tornito|\bpizza\b|chamoy|tropikuhl|chao mein|bimbojaldre)/, "Snacks y Dulces"],
  [/(leche|crema(?!&)|queso duro|cuajada|mantequilla|margarina|huevo|yogur|reques[oó]n|natilla|colado)/, "Lácteos y Huevos"],
  [/(para lavar|trastes|para ropa|cloro|lej[ií]a|detergente|suavizante|limpiador|desinfectante|escoba|trapeador|esponja|axion|azistin|fabuloso|pinol|baygon|raid|magia blanca|cera para|trapo|s[aá]bana de piso|ambientador|zagaz|orix|rinso|maxisplash|espumil|sarricida|\bcal\b)/, "Productos de Limpieza del Hogar"],
  [/(jab[oó]n|pasta dental|cepillo|shampo|champu|acondicionador|papel higi[eé]nico|papel (scott|encanto|toalla)|toalla|desodorante|afeit|gillete|gillette|navaja|pa[nñ]al|pamper|kotex|saba|fiore|isopo|algod[oó]n|enjuague|colonias|perfume|toallita|fresa labial|aceite de beb|cortau[nñ]a)/, "Cuidado Personal e Higiene"],
  [/(acetaminof|amoxicil|ibuprof|paracetamol|alcohol|curita|gasa|jarabe|pastilla|tableta|dolofin|dorival|sal de uvas|sueroral|suero|vitamina|blister|medicina|antiinflam|antibiotic|termometro|alka|panadol|intestinomicina)/, "Medicamentos y Farmacia"],
  [/(at[uú]n|sardina|ensalada campesina|en lata|conserva|chile en)/, "Enlatados y Conservas"],
  [/(vaso|plato|tenedor|cuchara|cuchillo|servilleta|pajilla|bolsa gabacha|contenedor|bandeja|desechable|charola|tapa para|bolsa de basura|bolsa jardin)/, "Artículos Desechables"],
  [/(juguete|pelota|mu[nñ]eca|carrito|globo|yoy[oó]|rompecabezas|peluche|set de)/, "Juguetes y Recreación"],
  [/(cuaderno|l[aá]piz|lapicero|bol[ií]grafo|marcador|cray[oó]n|folder|papel bond|papel de color|sacapuntas|\bregla\b|tijera|pegamento|pega |silicon|resma|agenda|calendario|sobres? para|sobre feliz|aritos|\bcola\b|colores pointer|l[aá]pices de color)/, "Papelería y Material Escolar"],
  [/(bater[ií]a|pila|foco|cable|cargador|aud[ií]fono|\bcontrol\b|linterna|extensi[oó]n|adaptador|radio)/, "Electrónicos y Baterías"],
  [/(arroz|frijol|az[uú]car|aceite|harina|maicena|maizena|pasta (fama|de tomate|para)|espagueti|fideo|macarr[oó]n|avena|lenteja|garbanzo|manteca|\bsopa\b|gelatina)/, "Alimentos Básicos y Granos"],
  [/\bsal\b|pimienta|comino|canela|or[eé]gano|laurel|achiote|consom|salsa|maggi|chile jalisco|condimento|caldo|vinagre|flor de jamaica|azafr[aá]n|curry|mostaza|mayonesa|ketchup|miel|vainilla|relajo|empanizador|ablandador|\bajo\b|tomillo/, "Condimentos y Especias"],
  [/(tomate|cebolla|\bpapa\b|zanahoria|\blim[oó]n\b|pl[aá]tano|banano|manzana|\bnaranja\b|aguacate|g[uü]isquil|elote|sand[ií]a|mel[oó]n|pi[nñ]a|pepino|chile verde|lechuga|repollo)/, "Frutas y Verduras"],
  [/(cereal|barra de|zucarita|chocokrispi|froot|kellogs|avena instant)/, "Cereales y Barras de Desayuno"],
  [/(candela|vela|f[oó]sforo|encendedor|guacal|huacal|cuerda|lazo|hilo|aguja|colador|cuchar[oó]n|recipiente|tostador|olla|peine|gancho|bolsa de|papel aluminio|bicarbonato|carb[oó]n|hules|lima para|monedero|\bcal\b)/, "Accesorios y Variedades"],
  [/(crema|brillantina|maquillaje|labial|esmalte|rubor|delineador)/, "Productos de Belleza y Cosmética"],
];

const PREFIJOS = {
  "Bebidas y Refrescos": "BE",
  "Productos para Mascotas": "MA",
  "Alimentos Básicos y Granos": "AB",
  "Artículos Desechables": "DS",
  "Telefonía y Recargas": "TF",
  "Cuidado Personal e Higiene": "HI",
  "Snacks y Dulces": "SN",
  "Productos de Limpieza del Hogar": "LI",
  "Accesorios y Variedades": "VA",
  "Helados y Postres Congelados": "HL",
  "Medicamentos y Farmacia": "MD",
  "Juguetes y Recreación": "JG",
  "Papelería y Material Escolar": "PP",
  "Condimentos y Especias": "CS",
  "Lácteos y Huevos": "LH",
  "Enlatados y Conservas": "EC",
  "Artículos para el Hogar y Utensilios": "HG",
  "Panadería y Repostería": "PR",
  "Café e Infusiones": "CA",
  "Frutas y Verduras": "FV",
  "Cereales y Barras de Desayuno": "CE",
  "Electrónicos y Baterías": "EL",
  "Higiene Femenina": "HF",
  "Artículos de Temporada y Regalo": "TR",
  "Productos de Belleza y Cosmética": "BC",
};

function categoriaDe(nombre, categoriaCashbook) {
  const texto = sinAcentos(nombre);
  for (const [patron, categoria] of REGLAS) if (patron.test(texto)) return categoria;
  return CATEGORIA_POR_DEFECTO[categoriaCashbook] ?? "Accesorios y Variedades";
}

// Palabras que no distinguen un producto de otro: unidades, tamaños y envases.
// Tamaño explícito del envase: 450ml, 1.25l, 750g, 2.2lb. Dos nombres con el
// mismo tipo de medida y valores distintos NUNCA son el mismo producto; si las
// medidas no son comparables (4oz contra 119g) no se descarta el emparejamiento.
function tamanos(nombre) {
  const encontrados = normalizar(nombre).match(/\d+(?:\.\d+)?(?:ml|lt|l|kg|gr|g|oz|lbs?)\b/g) ?? [];
  const grupos = new Map();
  for (const texto of encontrados) {
    const [, valor, unidad] = /^(\d+(?:\.\d+)?)(ml|lt|l|kg|gr|g|oz|lbs?)$/.exec(texto);
    const gramos = unidad === "kg" ? Number(valor) * 1000 : unidad === "gr" || unidad === "g" ? Number(valor) : null;
    const mililitros = unidad === "lt" || unidad === "l" ? Number(valor) * 1000 : unidad === "ml" ? Number(valor) : null;
    const libras = unidad.startsWith("lb") ? Number(valor) : null;
    if (gramos !== null) grupos.set("g", (grupos.get("g") ?? []).concat(gramos));
    else if (mililitros !== null) grupos.set("ml", (grupos.get("ml") ?? []).concat(mililitros));
    else if (libras !== null) grupos.set("lb", (grupos.get("lb") ?? []).concat(libras));
    else grupos.set("oz", (grupos.get("oz") ?? []).concat(Number(valor)));
  }
  return grupos;
}

function mismoTamano(a, b) {
  for (const [unidad, valores] of tamanos(a)) {
    const otros = tamanos(b).get(unidad);
    if (otros && otros.length && valores.length && otros.join(",") !== valores.join(",")) return false;
  }
  return true;
}

const RUIDO =
  /^(\d+(g|gr|ml|l|lt|kg|oz|lb|lbs|ud|uds|paq)?|l|lt|ml|g|gr|kg|oz|lb|lbs|ud|uds|paq|paquete|doc|docena|caja|bolsa|sobre|tira|tiras|un|unidad|unidades|pza|pzas|plastico|plasticos|galon|litro|botella|pote|bote)$/;

/** Clave del producto sin unidades, envases ni plurales: "Vasos #8 plast." = "vasos #8". */
function tokensClave(nombre) {
  return normalizar(nombre)
    .split(" ")
    .filter((token) => token && !RUIDO.test(token))
    .map((token) => (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token))
    .sort();
}

function mesDe(fecha) {
  const partes = /^(\d{1,2})\s+([a-z]{3,})\s+(\d{4})/i.exec((fecha ?? "").trim());
  return partes ? `${partes[3]}-${partes[2].toLowerCase()}` : null;
}

// Mismo formato que el catálogo viejo: PA-ADH-050, SN-DOR-002. Tres letras de la
// primera palabra con contenido (se saltan números sueltos como "1" o "3").
const mnemonicode = (nombre) => {
  const palabras = normalizar(nombre)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((palabra) => palabra && !/^\d+$/.test(palabra));
  const letras = (palabras[0] ?? "").replace(/\d/g, "") || palabras.join("").replace(/\d/g, "");
  return (letras + "XXX").slice(0, 3).toUpperCase();
};

// ------------------------------------------------------------------ lectura
const filas = readSheets(rutaPlanilla)[0].rows.slice(8).filter((fila) => fila[1]);
const ingresos = filas.filter((fila) => Number(fila[5]) > 0);
const mesesDelPeriodo = new Set(ingresos.map((fila) => mesDe(fila[0]) ?? fila[0])).size || 1;

const articulos = new Map();
for (const fila of ingresos) {
  const nombre = fila[1].replace(/\s+/g, " ").trim();
  const clave = normalizar(nombre);
  if (!clave) continue;
  const importe = Number(fila[5]) || 0;
  const cantidad = leerCantidad(fila[3]);
  const actual = articulos.get(clave) ?? {
    nombre,
    categoriaCashbook: (fila[4] || "").trim(),
    lineas: 0,
    unidades: 0,
    ingreso: 0,
    precios: new Map(),
    porLibra: false,
  };
  actual.lineas += 1;
  actual.unidades += cantidad;
  actual.ingreso += importe;
  if (/\b(lb|libras?)\b/i.test(fila[3] || "")) actual.porLibra = true;
  const unitario = cantidad > 0 ? Number((importe / cantidad).toFixed(2)) : importe;
  actual.precios.set(unitario, (actual.precios.get(unitario) ?? 0) + 1);
  if (nombre.length > actual.nombre.length) actual.nombre = nombre;
  articulos.set(clave, actual);
}

const porRotacion = (unidadesMensuales) => {
  if (unidadesMensuales >= 20) return 5;
  if (unidadesMensuales >= 8) return 3;
  if (unidadesMensuales >= 3) return 2;
  return 1;
};

const prisma = new PrismaClient();
const categoriasDb = await prisma.categoria.findMany({ select: { id: true, categoryName: true } });
const categoriaPorNombre = new Map(categoriasDb.map((c) => [c.categoryName, c]));
const productosDb = await prisma.producto.findMany({
  select: { id: true, sku: true, name: true, salePrice: true, currentStock: true, categoryId: true, isActive: true },
});

const porNombre = new Map();
const porClave = new Map();
for (const producto of productosDb) {
  porNombre.set(normalizar(producto.name), producto);
  const clave = tokensClave(producto.name).join(" ");
  if (!clave) continue;
  porClave.set(clave, (porClave.get(clave) ?? []).concat(producto));
}

const coincidencias = [];
const nuevos = [];
const yaEmparejados = new Set();
const pendientes = [];
// Primero los nombres idénticos, para que ningún emparejamiento difuso les robe el producto.
for (const articulo of articulos.values()) {
  const producto = porNombre.get(normalizar(articulo.nombre));
  if (producto) {
    yaEmparejados.add(producto.id);
    pendientes.push({ articulo, producto });
  } else {
    pendientes.push({ articulo, producto: null });
  }
}
for (const fila of pendientes) {
  const { articulo } = fila;
  let producto = fila.producto;
  if (!producto) {
    const opciones = porClave.get(tokensClave(articulo.nombre).join(" ")) ?? [];
    let candidato = opciones.find(
      (opcion) => !yaEmparejados.has(opcion.id) && mismoTamano(articulo.nombre, opcion.name),
    );
    if (!candidato) {
      // Ya hay un producto para ese nombre, solo que escrito con una palabra de
      // más ("Maxichucho 750g" y "Maxichucho bolsa 750g"): es el mismo. Se exige
      // que TODAS las palabras vendidas estén en el nombre del producto, así
      // "don fino bolsa" no se confunde con "don fino lb".
      const vendidas = normalizar(articulo.nombre).split(" ");
      candidato = opciones.find(
        (opcion) =>
          mismoTamano(articulo.nombre, opcion.name) &&
          vendidas.every((token) => normalizar(opcion.name).split(" ").includes(token)),
      );
    }
    if (candidato) {
      producto = candidato;
      yaEmparejados.add(candidato.id);
    }
  }
  const precioModal = [...articulo.precios.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const categoria = categoriaDe(articulo.nombre, articulo.categoriaCashbook);
  if (producto) coincidencias.push({ articulo, producto, precioModal, categoria });
  else nuevos.push({ ...articulo, precioModal, categoria });
}

const idsCoincidentes = new Set(coincidencias.map((c) => c.producto.id));
const obsoletos = productosDb.filter((p) => !idsCoincidentes.has(p.id));

// ------------------------------------------------------------------- respaldo
const csv = (filasCsv) =>
  filasCsv.map((fila) => fila.map((valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

mkdirSync(RESPALDO, { recursive: true });
// El respaldo se escribe una sola vez por día: si ya existe, es el catálogo
// anterior a la primera sincronización y no se debe pisar con el ya cambiado.
const rutaRespaldo = `${RESPALDO}/productos-${HOY}.csv`;
if (!existsSync(rutaRespaldo)) {
  writeFileSync(
    rutaRespaldo,
    csv([
      ["id", "sku", "name", "sale_price", "current_stock", "category_id", "is_active"],
      ...productosDb.map((p) => [p.id, p.sku, p.name, p.salePrice, p.currentStock, p.categoryId, p.isActive]),
    ]),
  );
}
writeFileSync(
  `${RESPALDO}/categorias-${HOY}.csv`,
  csv([["category_name"], ...categoriasDb.map((c) => [c.categoryName])]),
);

const categoriasFaltantes = [...new Set([...coincidencias, ...nuevos].map((i) => i.categoria))].filter(
  (nombre) => !categoriaPorNombre.has(nombre),
);

console.log(`Planilla: ${rutaPlanilla.split(/[\\/]/).pop()}`);
console.log(`Ventas leídas: ${ingresos.length} líneas · ${articulos.size} artículos distintos · meses ${mesesDelPeriodo}`);
console.log(`Emparejados con el catálogo: ${coincidencias.length}`);
console.log(`Artículos nuevos: ${nuevos.length}`);
console.log(`Productos del catálogo sin ninguna venta (se desactivan): ${obsoletos.length}`);
console.log(`Categorías nuevas a crear: ${categoriasFaltantes.join(", ") || "ninguna"}`);
const consolidados = new Map();
for (const c of coincidencias) {
  const nombres = consolidados.get(c.producto.id) ?? new Set();
  nombres.add(c.articulo.nombre);
  consolidados.set(c.producto.id, nombres);
}
const unificados = [...consolidados.entries()].filter(([, nombres]) => nombres.size > 1);
if (unificados.length) {
  console.log(`Entradas del cashbook unificadas en un solo producto: ${unificados.length}`);
  for (const [id, nombres] of unificados.slice(0, 20)) {
    const producto = productosDb.find((p) => p.id === id);
    console.log(`  ${producto?.name}: ${[...nombres].join(" + ")}`);
  }
}

writeFileSync(
  `${RESPALDO}/reconciliacion-${HOY}.csv`,
  csv([
    ["accion", "nombre", "categoria", "ventas", "unidades", "ingreso", "precio_unitario", "sku_o_motivo"],
    ...coincidencias.map((c) => [
      Number(c.precioModal) !== Number(c.producto.salePrice) ? "precio actualizado" : "ya existía",
      c.producto.name,
      c.categoria,
      c.articulo.lineas,
      c.articulo.unidades.toFixed(2),
      c.articulo.ingreso.toFixed(2),
      c.precioModal.toFixed(2),
      c.producto.sku,
    ]),
    ...nuevos.map((n) => [
      "nuevo",
      n.nombre,
      n.categoria,
      n.lineas,
      n.unidades.toFixed(2),
      n.ingreso.toFixed(2),
      n.precioModal.toFixed(2),
      "sin coincidencia en el catálogo",
    ]),
    ...obsoletos.map((p) => ["desactivado", p.name, "", 0, 0, 0, Number(p.salePrice).toFixed(2), "sin ventas en el período"]),
  ]),
);

if (!APLICAR) {
  console.log(`\nSimulación. Detalle en ${RESPALDO}/reconciliacion-${HOY}.csv`);
  console.log("Volvé a correr con --aplicar para escribir en la base.");
  await prisma.$disconnect();
  process.exit(0);
}

// -------------------------------------------------------------------- aplicación
const skusUsados = new Set(productosDb.map((p) => p.sku));

for (const nombre of categoriasFaltantes) {
  await prisma.categoria.create({ data: { categoryName: nombre } });
  console.log(`+ categoría ${nombre}`);
}
const categoriasActuales = await prisma.categoria.findMany({ select: { id: true, categoryName: true } });
const idCategoria = new Map(categoriasActuales.map((c) => [c.categoryName, c.id]));

// Varias entradas del libro de caja pueden apuntar al mismo producto: manda la
// que más se vendió, para que el precio guardado sea el representativo.
const porProducto = new Map();
for (const c of coincidencias) {
  const previo = porProducto.get(c.producto.id);
  if (!previo || c.articulo.lineas > previo.articulo.lineas) porProducto.set(c.producto.id, c);
}
const preciosCambiados = [...porProducto.values()].filter((c) => {
  const precio = c.precioModal > 0 && Number(c.precioModal) !== Number(c.producto.salePrice);
  const destino = idCategoria.get(c.categoria);
  const categoria = Boolean(destino) && destino !== c.producto.categoryId;
  return precio || categoria;
});
await prisma.$transaction(
  preciosCambiados.map((c) =>
    prisma.producto.update({
      where: { id: c.producto.id },
      data: {
        ...(c.precioModal > 0 ? { salePrice: c.precioModal.toFixed(2) } : {}),
        categoryId: idCategoria.get(c.categoria) ?? c.producto.categoryId ?? null,
      },
    }),
  ),
  { timeout: 180000 },
);

const mnemonicosPorCategoria = new Map();
const nuevosConSku = nuevos.map((n) => {
  const prefijo = PREFIJOS[n.categoria] ?? "XX";
  const clave = `${prefijo}-${mnemonicode(n.nombre)}`;
  const consecutivo = (mnemonicosPorCategoria.get(clave) ?? 0) + 1;
  mnemonicosPorCategoria.set(clave, consecutivo);
  let sku = `${clave}-${String(consecutivo).padStart(3, "0")}`;
  while (skusUsados.has(sku)) {
    const siguiente = (mnemonicosPorCategoria.get(clave) ?? consecutivo) + 1;
    mnemonicosPorCategoria.set(clave, siguiente);
    sku = `${clave}-${String(siguiente).padStart(3, "0")}`;
  }
  skusUsados.add(sku);
  return {
    sku,
    name: limpiarNombre(n.nombre),
    description: n.porLibra ? "Se vende por libra" : null,
    categoryId: idCategoria.get(n.categoria) ?? null,
    purchasePrice: "0",
    salePrice: (n.precioModal > 0 ? n.precioModal : 0).toFixed(2),
    currentStock: 0,
    minStock: porRotacion(n.unidades / mesesDelPeriodo),
    isActive: true,
  };
});

for (let i = 0; i < nuevosConSku.length; i += 300) {
  await prisma.producto.createMany({ data: nuevosConSku.slice(i, i + 300) });
}

// Todo lo que se vendió tiene que quedar disponible en el punto de venta, aunque
// una corrida anterior lo haya desactivado.
await prisma.producto.updateMany({
  where: { id: { in: [...idsCoincidentes] }, isActive: false },
  data: { isActive: true },
});

if (obsoletos.length) {
  await prisma.producto.updateMany({
    where: { id: { in: obsoletos.map((p) => p.id) } },
    data: { isActive: false },
  });
}

// Dos entradas del catálogo con el mismo nombre son un error de carga: queda
// activa una sola (la de código más bajo) para no duplicar en el punto de venta.
const duplicados = await prisma.$queryRaw`
  SELECT lower(name) AS nombre, array_agg(id::text ORDER BY sku) AS ids
  FROM productos WHERE is_active GROUP BY lower(name) HAVING COUNT(*) > 1`;
for (const duplicado of duplicados) {
  await prisma.producto.updateMany({
    where: { id: { in: duplicado.ids.slice(1) } },
    data: { isActive: false },
  });
  console.log(`= duplicado desactivado: ${duplicado.nombre}`);
}

const metricas = new Map();
for (const item of [...coincidencias, ...nuevos]) {
  const actual = metricas.get(item.categoria) ?? { lineas: 0, unidades: 0, ingreso: 0 };
  const lineas = item.articulo?.lineas ?? item.lineas;
  const unidades = item.articulo?.unidades ?? item.unidades;
  const ingreso = item.articulo?.ingreso ?? item.ingreso;
  metricas.set(item.categoria, {
    lineas: actual.lineas + lineas,
    unidades: actual.unidades + unidades,
    ingreso: actual.ingreso + ingreso,
  });
}
for (const [nombre, metrica] of metricas) {
  const id = idCategoria.get(nombre);
  if (!id) continue;
  await prisma.categoria.update({
    where: { id },
    data: {
      itemsSold: metrica.lineas,
      totalQuantitySold: Math.round(metrica.unidades),
      totalRevenue: metrica.ingreso.toFixed(2),
    },
  });
}
// Las categorías sin ninguna venta en la planilla no pueden seguir mostrando
// el historial inventado del seed: su historial real es cero.
await prisma.categoria.updateMany({
  where: { categoryName: { notIn: [...metricas.keys()] } },
  data: { itemsSold: 0, totalQuantitySold: 0, totalRevenue: 0 },
});

const totalIngresos = [...metricas.values()].reduce((suma, m) => suma + m.ingreso, 0);
console.log(`\nAplicado: ${nuevosConSku.length} productos nuevos, ${preciosCambiados.length} precios actualizados, ${obsoletos.length} desactivados.`);
console.log(`Ingresos del período cargados en las categorías: $${totalIngresos.toFixed(2)}`);
console.log(`Respaldo del catálogo anterior: ${RESPALDO}/productos-${HOY}.csv`);
await prisma.$disconnect();
