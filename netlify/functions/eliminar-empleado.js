import { google } from "googleapis";
import process from "node:process";
import { isAdminToken } from "../../shared/supabaseAdminAuth.js";
import { deleteEmployeeDriveAndExcel } from "../../shared/employeeCleanup.js";
import { getGoogleAuth } from "./_drive.js";

export async function handler(event) {
  if (event.httpMethod !== "DELETE") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido." }) };
  }

  const authorization = event.headers.authorization || event.headers.Authorization;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!(await isAdminToken(token))) {
    return { statusCode: 401, body: JSON.stringify({ error: "Debes iniciar sesión como administrador." }) };
  }

  const cedula = String(event.queryStringParameters?.cedula || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(cedula)) {
    return { statusCode: 400, body: JSON.stringify({ error: "La cédula del empleado no es válida." }) };
  }

  const { GOOGLE_SPREADSHEET_ID: spreadsheetId, GOOGLE_SHEET_NAME: configuredSheetName, GOOGLE_DRIVE_FOLDER_ID: rootFolderId } = process.env;
  if (!spreadsheetId || !rootFolderId) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta configurar GOOGLE_SPREADSHEET_ID o GOOGLE_DRIVE_FOLDER_ID." }) };
  }

  try {
    const auth = getGoogleAuth(["https://www.googleapis.com/auth/drive"]);
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });
    const result = await deleteEmployeeDriveAndExcel(drive, {
      cedula,
      rootFolderId,
      spreadsheetId,
      sheetName: configuredSheetName || "Empleados",
      sheets,
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
  } catch (error) {
    console.error("Error eliminando datos del empleado de Drive y Excel:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "No se pudieron eliminar los datos de Drive y Excel." }),
    };
  }
}
