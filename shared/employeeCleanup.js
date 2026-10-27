import { clearEmployeeRowFromXlsx } from "./xlsxEmployees.js";
import { Buffer } from "node:buffer";

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function isGoogleFileNotFound(error) {
  return error?.response?.status === 404
    || error?.status === 404
    || error?.code?.code === 404;
}

const GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

function columnLetter(index) {
  let letter = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  }
  return letter;
}

async function clearEmployeeRowsFromGoogleSheet(sheets, { spreadsheetId, sheetName, cedula }) {
  const quotedName = `'${sheetName.replace(/'/g, "''")}'`;
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quotedName,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = data.values || [];
  const normalize = (value) => String(value ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const headerIndex = rows.findIndex((row) => row.some((cell) => ["cedula", "cc"].includes(normalize(cell))));
  if (headerIndex < 0) throw new Error('No se encontró la columna "CEDULA" en la hoja.');
  const cedulaColumn = rows[headerIndex].findIndex((cell) => ["cedula", "cc"].includes(normalize(cell)));

  const ranges = [];
  rows.forEach((row, index) => {
    if (index <= headerIndex) return;
    if (String(row[cedulaColumn] ?? "").trim() !== String(cedula).trim()) return;
    ranges.push(`${quotedName}!A${index + 1}:${columnLetter(Math.max(row.length, 1) - 1)}${index + 1}`);
  });
  if (!ranges.length) return 0;

  await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges } });
  return ranges.length;
}

async function listChildren(drive, parentId) {
  const files = [];
  let pageToken;

  do {
    const result = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(...(result.data.files || []));
    pageToken = result.data.nextPageToken;
  } while (pageToken);

  return files;
}

export async function deleteEmployeeDriveAndExcel(
  drive,
  { cedula, rootFolderId, spreadsheetId, sheetName, sheets }
) {
  let workbookFile;
  try {
    ({ data: workbookFile } = await drive.files.get({
      fileId: spreadsheetId,
      fields: "name,mimeType",
      supportsAllDrives: true,
    }));
  } catch (error) {
    if (isGoogleFileNotFound(error)) {
      throw new Error(
        "Google Drive no encuentra el Excel configurado o la cuenta usada por el backend no tiene acceso. Verifica que GOOGLE_SPREADSHEET_ID en backend/.env sea el ID del archivo .xlsx y compártelo con la cuenta autorizada como editor.",
        { cause: error }
      );
    }
    throw error;
  }
  const isGoogleSheet = workbookFile.mimeType === GOOGLE_SHEET_MIME_TYPE;
  if (isGoogleSheet && !sheets) {
    throw new Error("Falta el cliente de Google Sheets para limpiar la Hoja de Google.");
  }
  if (!isGoogleSheet && workbookFile.mimeType !== XLSX_MIME_TYPE) {
    throw new Error(
      `El archivo "${workbookFile.name}" (${workbookFile.mimeType}) no es un Excel .xlsx ni una Hoja de Google compatible. Verifica que GOOGLE_SPREADSHEET_ID no sea el de GOOGLE_DRIVE_FOLDER_ID.`
    );
  }

  const employeeFoldersPromise = listChildren(drive, rootFolderId).then((items) => items.filter(
    (item) => item.mimeType === DRIVE_FOLDER_MIME_TYPE
      && (item.name === cedula || item.name.startsWith(`${cedula}_`))
  ));
  employeeFoldersPromise.catch(() => {});

  let clearedWorkbook = null;
  let sheetRowsCleared = 0;
  if (isGoogleSheet) {
    sheetRowsCleared = await clearEmployeeRowsFromGoogleSheet(sheets, {
      spreadsheetId,
      sheetName,
      cedula,
    });
  } else {
    const download = await drive.files.get(
      { fileId: spreadsheetId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    clearedWorkbook = clearEmployeeRowFromXlsx(Buffer.from(download.data), {
      sheetName,
      cedula,
    });
  }
  if (clearedWorkbook) {
    const { Readable } = await import("node:stream");
    await drive.files.update({
      fileId: spreadsheetId,
      supportsAllDrives: true,
      media: {
        mimeType: XLSX_MIME_TYPE,
        body: Readable.from([clearedWorkbook]),
      },
      fields: "id",
    });
  }

  const employeeFolders = await employeeFoldersPromise;

  // Deleting a folder in Drive also deletes its contents, so one call per folder is enough.
  await Promise.all(employeeFolders.map(async (folder) => {
    try {
      await drive.files.delete({ fileId: folder.id, supportsAllDrives: true });
    } catch (error) {
      if (!isGoogleFileNotFound(error)) throw error;
    }
  }));

  return {
    excelRowCleared: Boolean(clearedWorkbook) || sheetRowsCleared > 0,
    driveFoldersDeleted: employeeFolders.length,
  };
}
