import PizZip from "pizzip";
import { withDriveRetry } from "./driveRetry.js";

function decodeXml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function encodeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getAttributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)]
      .map((match) => [match[1], decodeXml(match[2])])
  );
}

function getSharedStrings(zip) {
  const xml = zip.file("xl/sharedStrings.xml")?.asText();
  if (!xml) return [];

  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1]))
      .join("")
  );
}

function getWorksheetPath(zip, sheetName) {
  const workbookXml = zip.file("xl/workbook.xml")?.asText();
  const relationshipsXml = zip.file("xl/_rels/workbook.xml.rels")?.asText();
  if (!workbookXml || !relationshipsXml) {
    throw new Error("El archivo Excel no contiene una estructura de libro válida.");
  }

  const sheet = [...workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)]
    .map((match) => getAttributes(match[0]))
    .find((attributes) => attributes.name === sheetName);
  if (!sheet) {
    const availableSheets = [...workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)]
      .map((match) => getAttributes(match[0]).name)
      .filter(Boolean);
    throw new Error(
      `No existe la pestaña "${sheetName}" en el archivo Excel. Pestañas disponibles: ${availableSheets.join(", ")}.`
    );
  }

  const relationshipId = sheet["r:id"];
  const relationship = [...relationshipsXml.matchAll(/<Relationship\b[^>]*\/?>/g)]
    .map((match) => getAttributes(match[0]))
    .find((attributes) => attributes.Id === relationshipId);
  if (!relationship?.Target) {
    throw new Error(`No se encontró la ruta interna de la pestaña "${sheetName}".`);
  }

  const target = relationship.Target.replace(/\\/g, "/");
  const segments = (target.startsWith("/") ? target.slice(1) : `xl/${target}`)
    .split("/");
  const normalized = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      normalized.pop();
    } else {
      normalized.push(segment);
    }
  }

  return normalized.join("/");
}

function readHeaderRow(worksheetXml, sharedStrings) {
  const row = [...worksheetXml.matchAll(/<row\b[^>]*\br="1"[^>]*>([\s\S]*?)<\/row>/g)][0];
  if (!row) {
    throw new Error('La pestaña "Empleados" no tiene encabezados en la primera fila.');
  }

  return [...row[1].matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)]
    .map((match) => {
      const attributes = getAttributes(match[0].match(/^<c\b[^>]*>/)[0]);
      const reference = attributes.r;
      if (!reference) return null;

      const column = reference.match(/^([A-Z]+)/)?.[1];
      const cellValue = match[0].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      const inlineValue = [...match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
        .map((text) => decodeXml(text[1]))
        .join("");

      let value = inlineValue || (cellValue ? decodeXml(cellValue) : "");
      if (attributes.t === "s" && cellValue !== undefined) {
        value = sharedStrings[Number(cellValue)] || "";
      }
      return column ? { column, value } : null;
    })
    .filter(Boolean);
}

function columnName(columnIndex) {
  let index = columnIndex + 1;
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function columnIndex(column) {
  return [...column].reduce(
    (index, letter) => index * 26 + letter.charCodeAt(0) - 64,
    0
  ) - 1;
}

const columnAliases = new Map(
  Object.entries({
    cedula: "cedula",
    documento: "cedula",
    identificacion: "cedula",
    nombre_completo: "nombre_completo",
    correo: "correo",
    email: "correo",
    cargo: "cargo",
    item: "item",
    proyecto: "proyecto",
    lugar_expedicion: "lugar_expedicion",
    lugar_expedicion_departamento: "lugar_expedicion_departamento",
    lugar_expedicion_municipio: "lugar_expedicion_municipio",
    fecha_nacimiento: "fecha_nacimiento",
    lugar_nacimiento: "lugar_nacimiento",
    lugar_nacimiento_departamento: "lugar_nacimiento_departamento",
    lugar_nacimiento_municipio: "lugar_nacimiento_municipio",
    celular: "celular",
    telefono: "celular",
    direccion: "direccion",
    ciudad: "ciudad",
    ciudad_departamento: "ciudad_departamento",
    ciudad_municipio: "ciudad_municipio",
    salario_basico: "salario_basico",
    auxilio_1: "auxilio_1",
    auxilio_de_alimentacion: "auxilio_1",
    auxilio_2: "auxilio_2",
    auxilio_de_vivienda: "auxilio_2",
    bono_productividad: "bono_productividad",
    bono_mera_liberalidad: "bono_mera_liberalidad",
    cuenta_bancaria: "cuenta_bancaria",
    entidad_financiera: "entidad_financiera",
    persona_contacto: "persona_contacto",
    celular_contacto: "celular_contacto",
    parentesco: "parentesco",
    estado_civil: "estado_civil",
    tipo_sangre: "tipo_sangre",
    eps: "eps",
    eps_otra: "eps_otra",
    fondo_pension: "fondo_pension",
    fondo_pension_otra: "fondo_pension_otra",
    talla_botas: "talla_botas",
    talla_camisa: "talla_camisa",
    talla_pantalon: "talla_pantalon",
    fecha_inicio_contrato: "fecha_inicio_contrato",
    objeto_contrato: "objeto_contrato",
    lugar_desempeno_labores: "lugar_desempeno_labores",
    lugar_contratacion: "lugar_contratacion",
    frente_obra: "frente_obra",
    cedula_frente_url: "cedula_frente_url",
    cedula_respaldo_url: "cedula_respaldo_url",
    certificado_bancario_url: "certificado_bancario_url",
    certificado_eps_url: "certificado_eps_url",
    certificado_pension_url: "certificado_pension_url",
    fotografia_url: "fotografia_url",
    firma_url: "firma_url",
  }).map(([alias, key]) => [normalizeHeader(alias), key])
);

for (const [label, key] of Object.entries({
  "nombre completo": "nombre_completo",
  "lugar expedicion": "lugar_expedicion",
  "lugar nacimiento": "lugar_nacimiento",
  "ciudad": "ciudad",
  "salario basico": "salario_basico",
  "auxilio 1": "auxilio_1",
  "auxilio de alimentacion": "auxilio_1",
  "auxilio 2": "auxilio_2",
  "auxilio de vivienda": "auxilio_2",
  "bono productividad": "bono_productividad",
  "bono mera liberalidad": "bono_mera_liberalidad",
  "cuenta bancaria": "cuenta_bancaria",
  "entidad financiera": "entidad_financiera",
  "persona contacto": "persona_contacto",
  "celular contacto": "celular_contacto",
  "estado civil": "estado_civil",
  "tipo sangre": "tipo_sangre",
  "fondo pension": "fondo_pension",
  "fondo pension otra": "fondo_pension_otra",
  "talla botas": "talla_botas",
  "talla camisa": "talla_camisa",
  "talla pantalon": "talla_pantalon",
  "fecha inicio contrato": "fecha_inicio_contrato",
  "objeto contrato": "objeto_contrato",
  "lugar desempeno labores": "lugar_desempeno_labores",
  "lugar contratacion": "lugar_contratacion",
  "frente obra": "frente_obra",
  "cedula frente": "cedula_frente_url",
  "cedula respaldo": "cedula_respaldo_url",
  "certificado bancario": "certificado_bancario_url",
  "certificado eps": "certificado_eps_url",
  "certificado pension": "certificado_pension_url",
  "fotografia": "fotografia_url",
  "foto": "fotografia_url",
  "firma": "firma_url",
})) {
  columnAliases.set(normalizeHeader(label), key);
  columnAliases.set(normalizeHeader(`${label} url`), key);
}

function getValueForColumn(key, valuesByHeader) {
  if (key === "lugar_expedicion" || key === "lugar_nacimiento" || key === "ciudad") {
    const prefix = key === "ciudad" ? "ciudad" : key;
    const parts = [
      valuesByHeader.get(`${prefix}_departamento`),
      valuesByHeader.get(`${prefix}_municipio`),
    ].filter((value) => value !== undefined && value !== null && value !== "");
    return parts.join(" / ");
  }

  return valuesByHeader.get(key);
}

function serializeCell(reference, value, existingCellXml = "") {
  const openingTag = existingCellXml.match(/^<c\b[^>]*>/)?.[0] || "<c>";
  const attributes = getAttributes(openingTag);
  const preservedAttributes = Object.entries(attributes)
    .filter(([name]) => name !== "r" && name !== "t")
    .map(([name, attributeValue]) => ` ${name}="${encodeXml(attributeValue)}"`)
    .join("");
  const referenceAttribute = ` r="${encodeXml(reference)}"`;

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c${referenceAttribute}${preservedAttributes}><v>${value}</v></c>`;
  }

  if (typeof value === "boolean") {
    return `<c${referenceAttribute} t="b"${preservedAttributes}><v>${value ? 1 : 0}</v></c>`;
  }

  return `<c${referenceAttribute} t="inlineStr"${preservedAttributes}><is><t xml:space="preserve">${encodeXml(value)}</t></is></c>`;
}

function readCellValue(cellXml, attributes, sharedStrings) {
  if (attributes.t === "inlineStr") {
    return [...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXml(match[1]))
      .join("");
  }

  const rawValue = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (rawValue === undefined) return "";
  if (attributes.t === "s") return sharedStrings[Number(rawValue)] || "";
  return decodeXml(rawValue);
}

function getRowCells(rowXml, sharedStrings) {
  const rowStart = rowXml.match(/^<row\b[^>]*>/)?.[0];
  const rowAttributes = rowStart ? getAttributes(rowStart) : {};
  const cells = [...rowXml.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)]
    .map((match) => {
      const openingTag = match[0].match(/^<c\b[^>]*>/)?.[0] || match[0];
      const attributes = getAttributes(openingTag);
      const column = attributes.r?.match(/^([A-Z]+)/)?.[1];
      if (!column) return null;

      return {
        column,
        xml: match[0],
        formula: /<f\b/.test(match[0]),
        value: readCellValue(match[0], attributes, sharedStrings),
      };
    })
    .filter(Boolean);

  return { rowAttributes, cells };
}

function findEmployeeRow(sheetDataXml, cedulaColumn, sharedStrings, targetCedula) {
  const rows = new Map(
    [...sheetDataXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)]
      .map((match) => [Number(match[1]), match[0]])
  );
  const lastRow = Math.max(1, ...rows.keys());

  if (targetCedula !== undefined && targetCedula !== null && String(targetCedula).trim()) {
    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      const rowXml = rows.get(rowNumber);
      if (!rowXml) continue;

      const { cells } = getRowCells(rowXml, sharedStrings);
      const cedula = cells.find((cell) => cell.column === cedulaColumn);
      if (String(cedula?.value ?? "").trim() === String(targetCedula).trim()) {
        return rowNumber;
      }
    }
  }

  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const rowXml = rows.get(rowNumber);
    if (!rowXml) return rowNumber;

    const { cells } = getRowCells(rowXml, sharedStrings);
    const cedula = cells.find((cell) => cell.column === cedulaColumn);
    if (cedula?.value !== undefined && String(cedula.value).trim() !== "") continue;

    const hasOtherData = cells.some((cell) =>
      !cell.formula && cell.value !== undefined && String(cell.value).trim() !== ""
    );
    if (!hasOtherData) return rowNumber;
  }

  return lastRow + 1;
}

function updateEmployeeRow(rowXml, rowNumber, mappedCells) {
  const originalRow = rowXml || `<row r="${rowNumber}"></row>`;
  const cells = [...originalRow.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)]
    .map((match) => {
      const openingTag = match[0].match(/^<c\b[^>]*>/)?.[0] || match[0];
      const column = getAttributes(openingTag).r?.match(/^([A-Z]+)/)?.[1];
      return column ? { column, xml: match[0], index: match.index } : null;
    })
    .filter(Boolean);
  const cellsByColumn = new Map(cells.map((cell) => [cell.column, cell]));
  const pendingCells = new Map();

  for (const { column, value, key } of mappedCells) {
    if (value === null || value === undefined || value === "") continue;

    const columnLabel = columnName(column);
    const existingCell = cellsByColumn.get(columnLabel);
    if (existingCell && /<f\b/.test(existingCell.xml) && key !== "item") continue;

    const cellXml = serializeCell(
      `${columnLabel}${rowNumber}`,
      value,
      existingCell?.xml
    );
    if (existingCell) {
      existingCell.updatedXml = cellXml;
    } else {
      pendingCells.set(columnLabel, {
        index: column,
        xml: cellXml,
      });
    }
  }

  const pendingInOrder = [...pendingCells.values()]
    .sort((left, right) => left.index - right.index);
  let pendingIndex = 0;
  let lastIndex = 0;
  let updatedRow = "";
  for (const cell of cells) {
    updatedRow += originalRow.slice(lastIndex, cell.index);
    while (
      pendingIndex < pendingInOrder.length
      && pendingInOrder[pendingIndex].index < columnIndex(cell.column)
    ) {
      updatedRow += pendingInOrder[pendingIndex].xml;
      pendingIndex += 1;
    }
    updatedRow += cell.updatedXml || cell.xml;
    lastIndex = cell.index + cell.xml.length;
  }

  const rowClosingIndex = originalRow.lastIndexOf("</row>");
  const trailingRowContent = originalRow.slice(lastIndex, rowClosingIndex);
  const extensionIndex = trailingRowContent.search(/<extLst\b/);
  if (extensionIndex >= 0) {
    updatedRow += trailingRowContent.slice(0, extensionIndex);
  } else {
    updatedRow += trailingRowContent;
  }
  while (pendingIndex < pendingInOrder.length) {
    updatedRow += pendingInOrder[pendingIndex].xml;
    pendingIndex += 1;
  }
  if (extensionIndex >= 0) {
    updatedRow += trailingRowContent.slice(extensionIndex);
  }
  updatedRow += originalRow.slice(originalRow.lastIndexOf("</row>"));
  return updatedRow;
}

function expandDimension(worksheetXml, lastColumn, rowNumber) {
  return worksheetXml.replace(/<dimension\b([^>]*)\/?>/, (dimensionTag) => {
    const attributes = getAttributes(dimensionTag);
    const range = attributes.ref;
    if (!range) return dimensionTag;

    const [start, end = start] = range.split(":");
    const parseCell = (reference) => {
      const match = reference.match(/^\$?([A-Z]+)\$?(\d+)$/);
      return match ? { column: match[1], row: Number(match[2]) } : null;
    };
    const startCell = parseCell(start);
    const endCell = parseCell(end);
    if (!startCell || !endCell) return dimensionTag;

    const finalColumn = columnName(Math.max(
      [...endCell.column].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1,
      lastColumn
    ));
    const updatedRef = `${startCell.column}${startCell.row}:${finalColumn}${Math.max(endCell.row, rowNumber)}`;
    return dimensionTag.replace(
      /\bref="[^"]*"/,
      `ref="${updatedRef}"`
    );
  });
}

export async function upsertEmployeeRowInGoogleSheet(sheets, { spreadsheetId, sheetName, headers, values }) {
  if (!Array.isArray(headers) || !Array.isArray(values) || headers.length !== values.length) {
    throw new Error("No se pudieron asociar los campos del formulario con sus valores.");
  }

  const quotedName = `'${sheetName.replace(/'/g, "''")}'`;
  let rows;
  try {
    ({ data: { values: rows = [] } } = await withDriveRetry(() => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: quotedName,
      valueRenderOption: "UNFORMATTED_VALUE",
    })));
  } catch (error) {
    if (error?.status === 400 || error?.code === 400) {
      throw new Error(`No existe la pestaña "${sheetName}" en la Hoja de Google.`, { cause: error });
    }
    throw error;
  }

  const headerRow = rows[0] || [];
  const keys = headerRow.map((value) => columnAliases.get(normalizeHeader(value)));
  const cedulaColumn = keys.indexOf("cedula");
  if (cedulaColumn < 0) {
    throw new Error('No se encontró la columna "CEDULA" para ubicar la siguiente fila disponible.');
  }

  const valuesByHeader = new Map(
    headers.map((header, index) => [normalizeHeader(header), values[index]])
  );
  const cells = keys.flatMap((key, column) => {
    if (!key) return [];
    const value = getValueForColumn(key, valuesByHeader);
    return value === undefined ? [] : [{ column, value }];
  });
  if (!cells.some(({ value }) => value !== undefined && value !== "")) {
    throw new Error(
      `No se identificaron columnas compatibles en la primera fila de "${sheetName}". No se agregó la fila para evitar desordenar los datos.`
    );
  }

  const cedula = String(cells.find(({ column }) => column === cedulaColumn)?.value ?? "").trim();
  let rowIndex = cedula
    ? rows.findIndex((row, index) => index > 0 && String(row[cedulaColumn] ?? "").trim() === cedula)
    : -1;
  if (rowIndex < 0) {
    rowIndex = rows.findIndex(
      (row, index) => index > 0 && String(row[cedulaColumn] ?? "").trim() === ""
    );
    if (rowIndex < 0) rowIndex = rows.length;
  }

  const rowNumber = rowIndex + 1;
  const { data: spreadsheet } = await withDriveRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,gridProperties(rowCount)))",
  }));
  const sheetProperties = spreadsheet.sheets
    ?.map(({ properties }) => properties)
    .find((properties) => properties.title === sheetName);
  const rowCount = sheetProperties?.gridProperties?.rowCount ?? 0;
  if (sheetProperties && rowNumber > rowCount) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          appendDimension: {
            sheetId: sheetProperties.sheetId,
            dimension: "ROWS",
            length: Math.max(rowNumber - rowCount, 100),
          },
        }],
      },
    });
  }

  await withDriveRetry(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: cells.map(({ column, value }) => ({
        range: `${quotedName}!${columnName(column)}${rowNumber}`,
        values: [[value ?? ""]],
      })),
    },
  }));
  return rowNumber;
}

export function appendEmployeeRowToXlsx(fileBuffer, { sheetName, headers, values }) {
  if (!Array.isArray(headers) || !Array.isArray(values) || headers.length !== values.length) {
    throw new Error("No se pudieron asociar los campos del formulario con sus valores.");
  }

  const zip = new PizZip(fileBuffer);
  const worksheetPath = getWorksheetPath(zip, sheetName);
  const worksheetFile = zip.file(worksheetPath);
  if (!worksheetFile) {
    throw new Error(`No se pudo leer el contenido de la pestaña "${sheetName}".`);
  }

  let worksheetXml = worksheetFile.asText();
  const sharedStrings = getSharedStrings(zip);
  const headersInSheet = readHeaderRow(worksheetXml, sharedStrings);
  const cedulaHeader = headersInSheet.find(
    ({ value }) => columnAliases.get(normalizeHeader(value)) === "cedula"
  );
  if (!cedulaHeader) {
    throw new Error('No se encontró la columna "CEDULA" para ubicar la siguiente fila disponible.');
  }

  const valuesByHeader = new Map(
    headers.map((header, index) => [normalizeHeader(header), values[index]])
  );
  const mappedCells = headersInSheet.flatMap(({ column, value }) => {
    const key = columnAliases.get(normalizeHeader(value));
    if (!key) return [];

    const cellValue = getValueForColumn(key, valuesByHeader);
    if (cellValue === undefined) return [];

    return [{ column: columnIndex(column), value: cellValue, key }];
  });

  if (!mappedCells.some(({ value }) => value !== undefined && value !== "")) {
    throw new Error(
      'No se identificaron columnas compatibles en la primera fila de "Empleados". No se agregó la fila para evitar desordenar los datos.'
    );
  }

  const sheetDataMatch = worksheetXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
  if (!sheetDataMatch) {
    throw new Error(`La pestaña "${sheetName}" no contiene un área de datos válida.`);
  }

  const cedulaValue = mappedCells.find(
    ({ column }) => column === columnIndex(cedulaHeader.column)
  )?.value;
  const rowNumber = findEmployeeRow(
    sheetDataMatch[1],
    cedulaHeader.column,
    sharedStrings,
    cedulaValue
  );
  const existingRow = [...sheetDataMatch[1].matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)]
    .find((match) => Number(match[1]) === rowNumber)?.[0];
  const updatedRow = updateEmployeeRow(existingRow, rowNumber, mappedCells);
  let updatedSheetData;
  if (existingRow) {
    updatedSheetData = sheetDataMatch[1].replace(existingRow, updatedRow);
  } else {
    const nextRow = [...sheetDataMatch[1].matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)]
      .find((match) => Number(match[1]) > rowNumber);
    updatedSheetData = nextRow
      ? `${sheetDataMatch[1].slice(0, nextRow.index)}${updatedRow}${sheetDataMatch[1].slice(nextRow.index)}`
      : `${sheetDataMatch[1]}${updatedRow}`;
  }

  worksheetXml = worksheetXml.replace(
    sheetDataMatch[0],
    `<sheetData${sheetDataMatch[0].match(/^<sheetData\b([^>]*)>/)?.[1] || ""}>${updatedSheetData}</sheetData>`
  );
  worksheetXml = expandDimension(
    worksheetXml,
    Math.max(0, ...mappedCells.map(({ column }) => column)),
    rowNumber
  );
  zip.file(worksheetPath, worksheetXml);

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

export function clearEmployeeRowFromXlsx(fileBuffer, { sheetName, cedula }) {
  const zip = new PizZip(fileBuffer);
  const worksheetPath = getWorksheetPath(zip, sheetName);
  const worksheetFile = zip.file(worksheetPath);
  if (!worksheetFile) {
    throw new Error(`No se pudo leer el contenido de la pestaña "${sheetName}".`);
  }

  let worksheetXml = worksheetFile.asText();
  const sharedStrings = getSharedStrings(zip);
  const headers = readHeaderRow(worksheetXml, sharedStrings);
  const cedulaColumn = headers.find(
    ({ value }) => columnAliases.get(normalizeHeader(value)) === "cedula"
  )?.column;
  if (!cedulaColumn) {
    throw new Error('No se encontró la columna "CEDULA" en el Excel.');
  }

  const sheetDataMatch = worksheetXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
  if (!sheetDataMatch) {
    throw new Error(`La pestaña "${sheetName}" no contiene un área de datos válida.`);
  }

  const rowMatches = [...sheetDataMatch[1].matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)];
  const employeeRows = rowMatches.filter((match) => {
    const { cells } = getRowCells(match[0], sharedStrings);
    const cell = cells.find(({ column }) => column === cedulaColumn);
    return cell && String(cell.value).trim() === String(cedula).trim();
  });
  if (!employeeRows.length) return null;

  const mappedColumns = new Set(
    headers
      .filter(({ value }) => columnAliases.has(normalizeHeader(value)))
      .map(({ column }) => column)
  );
  let updatedSheetData = sheetDataMatch[1];

  for (const rowMatch of employeeRows) {
    const { rowAttributes, cells } = getRowCells(rowMatch[0], sharedStrings);
    const clearedCells = cells.map((cell) => {
      if (!mappedColumns.has(cell.column) || cell.formula) return cell.xml;

      const openingTag = cell.xml.match(/^<c\b[^>]*>/)?.[0] || cell.xml;
      const attributes = getAttributes(openingTag);
      const preserved = Object.entries(attributes)
        .filter(([name]) => name !== "t" && name !== "r")
        .map(([name, value]) => ` ${name}="${encodeXml(value)}"`)
        .join("");
      return `<c r="${cell.column}${rowAttributes.r}"${preserved}/>`;
    });
    const cellSet = new Set(cells.map((cell) => cell.xml));
    const clearedCellsByOriginal = new Map(
      cells.map((cell, index) => [cell.xml, clearedCells[index]])
    );
    const updatedRow = rowMatch[0].replace(
      /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,
      (cellXml) => cellSet.has(cellXml) ? clearedCellsByOriginal.get(cellXml) : cellXml
    );
    updatedSheetData = updatedSheetData.replace(rowMatch[0], updatedRow);
  }

  worksheetXml = worksheetXml.replace(
    sheetDataMatch[0],
    `<sheetData${sheetDataMatch[0].match(/^<sheetData\b([^>]*)>/)?.[1] || ""}>${updatedSheetData}</sheetData>`
  );
  zip.file(worksheetPath, worksheetXml);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
