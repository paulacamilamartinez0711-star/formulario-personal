import { google } from "googleapis";
import process from "node:process";
import { Readable } from "node:stream";
import { syncEmployeesToDriveAndExcel } from "../../shared/employeeDriveSync.js";
import { isAdminToken } from "../../shared/supabaseAdminAuth.js";
import { getGoogleAuth } from "./_drive.js";

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Método no permitido." });
  }

  const authorization = event.headers.authorization || event.headers.Authorization || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!(await isAdminToken(token))) {
    return response(401, { error: "Debes iniciar sesión como administrador." });
  }

  try {
    let empleados;
    try {
      empleados = JSON.parse(event.body || "{}").empleados;
    } catch {
      return response(400, { error: "El cuerpo de la solicitud no es válido." });
    }
    if (
      !Array.isArray(empleados)
      || empleados.length === 0
      || empleados.length > 25
      || empleados.some((empleado) => (
        !empleado
        || !/^[a-zA-Z0-9_-]+$/.test(String(empleado.cedula || ""))
        || !String(empleado.nombre_completo || "").trim()
      ))
    ) {
      return response(400, { error: "La lista de empleados no es válida." });
    }

    const drive = google.drive({
      version: "v3",
      auth: getGoogleAuth(["https://www.googleapis.com/auth/drive"]),
    });
    const sheets = google.sheets({
      version: "v4",
      auth: getGoogleAuth(["https://www.googleapis.com/auth/drive"]),
    });
    const result = await syncEmployeesToDriveAndExcel(
      drive,
      empleados,
      {
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        sheetName: process.env.GOOGLE_SHEET_NAME || "Hoja 1",
        rootFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
        storageAccessToken: token,
        sheets,
      }
    );

    if (result.updatedWorkbook) {
      await drive.files.update({
        fileId: process.env.GOOGLE_SPREADSHEET_ID,
        supportsAllDrives: true,
        media: {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: Readable.from([result.updatedWorkbook]),
        },
        fields: "id",
      });
    }

    return response(200, {
      ok: true,
      results: result.results,
      foldersCreated: result.foldersCreated,
      filesCopied: result.filesCopied,
      filesAlreadyInFolder: result.filesAlreadyInFolder,
      filesMoved: result.filesMoved,
      filesRenamed: result.filesRenamed,
      filesDeduplicated: result.filesDeduplicated,
    });
  } catch (error) {
    console.error("Error sincronizando empleados con Drive y Excel:", error);
    return response(500, {
      error: error.message || "No se pudieron sincronizar los empleados.",
    });
  }
}
