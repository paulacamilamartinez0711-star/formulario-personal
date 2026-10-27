import { google } from "googleapis";
import { Buffer } from "node:buffer";
import process from "node:process";
import { Readable } from "node:stream";
import { appendEmployeeRowToXlsx, upsertEmployeeRowInGoogleSheet } from "../../shared/xlsxEmployees.js";
import { getGoogleAuth } from "./_drive.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido." }) };
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_NAME || "Hoja 1";
    const { encabezados, valores } = JSON.parse(event.body || "{}");

    if (!spreadsheetId) throw new Error("Falta GOOGLE_SPREADSHEET_ID en Netlify.");
    if (!Array.isArray(encabezados) || !Array.isArray(valores) || !valores.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "La fila de empleados no es válida." }) };
    }

    const drive = google.drive({
      version: "v3",
      auth: getGoogleAuth(["https://www.googleapis.com/auth/drive"]),
    });
    const { data: file } = await drive.files.get({
      fileId: spreadsheetId,
      fields: "name,mimeType",
      supportsAllDrives: true,
    });

    if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
      const sheets = google.sheets({
        version: "v4",
        auth: getGoogleAuth(["https://www.googleapis.com/auth/drive"]),
      });
      await upsertEmployeeRowInGoogleSheet(sheets, {
        spreadsheetId,
        sheetName,
        headers: encabezados,
        values: valores,
      });
      return { statusCode: 201, body: JSON.stringify({ ok: true }) };
    }

    if (file.mimeType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      throw new Error(
        `El archivo "${file.name}" no es un Excel .xlsx compatible. Verifica que GOOGLE_SPREADSHEET_ID corresponda al archivo Excel de Drive.`
      );
    }

    const download = await drive.files.get(
      { fileId: spreadsheetId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    const updatedFile = appendEmployeeRowToXlsx(Buffer.from(download.data), {
      sheetName,
      headers: encabezados,
      values: valores,
    });

    await drive.files.update({
      fileId: spreadsheetId,
      supportsAllDrives: true,
      media: {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Readable.from([updatedFile]),
      },
      fields: "id",
    });

    return { statusCode: 201, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error("Error agregando empleado al archivo Excel:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "No se pudo actualizar el archivo Excel." }) };
  }
}
