import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export function readXlsx(path) {
  const buf = readFileSync(path);
  // End of central directory: buscar la firma 0x06054b50 desde el final.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("No es un xlsx válido: falta el central directory");
  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error("Central directory corrupto");
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    entries.set(name, { method, compSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  const read = (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    const lh = entry.localOffset;
    const nameLen = buf.readUInt16LE(lh + 26);
    const extraLen = buf.readUInt16LE(lh + 28);
    const start = lh + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + entry.compSize);
    return entry.method === 0 ? data : inflateRawSync(data);
  };
  const xml = (name) => {
    const data = read(name);
    return data ? data.toString("utf8") : null;
  };
  return { names: [...entries.keys()], xml, read };
}

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

export function sharedStrings(workbook) {
  const xml = workbook.xml("xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(""),
  );
}

/** Devuelve [{ name, rows: string[][] }] para cada hoja. */
export function readSheets(path) {
  const workbook = readXlsx(path);
  const strings = sharedStrings(workbook);
  const rels = workbook.xml("xl/_rels/workbook.xml.rels") ?? "";
  const relMap = new Map();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relMap.set(m[1], m[2].replace(/^\//, "").replace(/^xl\//, ""));
  }
  const wb = workbook.xml("xl/workbook.xml") ?? "";
  const sheets = [];
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const target = relMap.get(m[2]);
    if (!target) continue;
    const sheetPath = target.startsWith("xl/") ? target : `xl/${target}`;
    const xml = workbook.xml(sheetPath);
    if (!xml) continue;
    const rows = [];
    for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cm of rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cm[1];
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
        const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
        const raw = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1];
        const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cm[2])?.[1];
        let value = "";
        if (type === "s" && raw !== undefined) value = strings[Number(raw)] ?? "";
        else if (type === "inlineStr" && inline !== undefined) value = unescapeXml(inline);
        else if (raw !== undefined) value = unescapeXml(raw);
        else if (inline !== undefined) value = unescapeXml(inline);
        const colIndex = ref
          ? [...ref].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
          : cells.length;
        cells[colIndex] = value;
      }
      rows.push(Array.from(cells, (v) => v ?? ""));
    }
    sheets.push({ name: m[1], rows });
  }
  return sheets;
}
