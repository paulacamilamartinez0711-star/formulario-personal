import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import multer from "multer";
import { google } from "googleapis";
import { appendEmployeeRowToXlsx, upsertEmployeeRowInGoogleSheet } from "../shared/xlsxEmployees.js";
import { deleteEmployeeDriveAndExcel } from "../shared/employeeCleanup.js";
import { syncEmployeesToDriveAndExcel } from "../shared/employeeDriveSync.js";
import { getPublishedContractForEmployee } from "../shared/employeeContractAccess.js";
import { signPublishedContracts } from "../shared/contractSigning.js";
import { getDriveUploadFileName, getEmployeeDriveFolderName } from "../shared/driveNaming.js";
import { belongsToEmployeeContractFolder } from "../shared/driveContractOwnership.js";
import {
  convertWordToPdf,
  getPublishedContractPdf,
  getWordMimeType,
  isWordDocumentName,
  uploadWordAsPdf,
} from "../shared/drivePdfConversion.js";
import { isAdminToken } from "../shared/supabaseAdminAuth.js";
import {
  isPublicFormUploadFolder,
  validatePublicFormUpload,
} from "../shared/uploadPolicy.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(backendDirectory, ".env"), override: true });

const app = express();
const port = Number(process.env.PORT || 3001);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function googleErrorCode(error) {
  return error?.response?.data?.error || error?.code;
}

function isGoogleFileNotFound(error) {
  return error?.response?.status === 404
    || error?.status === 404
    || error?.code?.code === 404;
}

function googleErrorMessage(error) {
  if (googleErrorCode(error) === "invalid_grant") {
    return "La autorización de Google Drive expiró o fue revocada. Vuelve a autorizarla en http://localhost:3001/auth/google.";
  }
  if (error?.response) {
    return `Google Drive respondió con un error (${error.response.status || "desconocido"}).`;
  }
  return error?.message || "No se pudo completar la operación con Google Drive.";
}

function logGoogleError(context, error) {
  console.error(context, {
    code: googleErrorCode(error) || "unknown",
    status: error?.response?.status || error?.status || null,
    message: error?.message || "Error sin mensaje",
  });
}

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const filePath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error(
      "Faltan GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY."
    );
  }

  return {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

function getOAuthCredentials() {
  const credentialsPath = process.env.GOOGLE_OAUTH_CLIENT_FILE;
  if (!credentialsPath) return null;

  const credentials = JSON.parse(fs.readFileSync(path.resolve(credentialsPath), "utf8"));
  return credentials.installed || credentials.web || credentials;
}

function getOAuthClient() {
  const credentials = getOAuthCredentials();
  if (!credentials?.client_id || !credentials?.client_secret) {
    throw new Error("Falta GOOGLE_OAUTH_CLIENT_FILE con credenciales OAuth de Google.");
  }

  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    "http://localhost:3001/auth/google/callback";

  return new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    redirectUri
  );
}

function getOAuthClientWithToken() {
  const auth = getOAuthClient();
  const tokenPath = path.join(backendDirectory, ".drive-token.json");

  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      "Google no está autorizado. Abre http://localhost:3001/auth/google y autoriza Drive y Sheets."
    );
  }

  auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
  return auth;
}

function getGoogleAuth(scopes) {
  if (process.env.GOOGLE_OAUTH_CLIENT_FILE) {
    return getOAuthClientWithToken();
  }

  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes,
  });
}

async function getDrive() {
  return google.drive({
    version: "v3",
    auth: getGoogleAuth(["https://www.googleapis.com/auth/drive"]),
  });
}

app.get("/auth/google", (_request, response) => {
  try {
    const auth = getOAuthClient();
    const url = auth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/drive"],
    });
    response.redirect(url);
  } catch (error) {
    response.status(500).send(error.message);
  }
});

app.post("/api/hoja-empleados", async (request, response) => {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_NAME || "Hoja 1";
    const { encabezados, valores } = request.body || {};

    if (!spreadsheetId) {
      return response.status(500).json({ error: "Falta GOOGLE_SPREADSHEET_ID en backend/.env." });
    }

    if (!Array.isArray(encabezados) || !Array.isArray(valores) || !valores.length) {
      return response.status(400).json({ error: "La fila de empleados no es válida." });
    }

    const drive = await getDrive();
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
      return response.status(201).json({ ok: true });
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

    return response.status(201).json({ ok: true });
  } catch (error) {
    logGoogleError("Error agregando empleado al archivo Excel:", error);
    return response.status(500).json({
      error: googleErrorMessage(error),
    });
  }
});

app.post("/api/sincronizar-empleados", async (request, response) => {
  const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!(await isAdminToken(token))) {
    return response.status(401).json({ error: "Debes iniciar sesión como administrador." });
  }

  const empleados = request.body?.empleados;
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
    return response.status(400).json({ error: "La lista de empleados no es válida." });
  }

  const { spreadsheetId, sheetName, rootFolderId } = {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    sheetName: process.env.GOOGLE_SHEET_NAME || "Hoja 1",
    rootFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
  };
  try {
    const drive = await getDrive();
    const sheets = google.sheets({
      version: "v4",
      auth: getGoogleAuth(["https://www.googleapis.com/auth/drive"]),
    });
    const result = await syncEmployeesToDriveAndExcel(
      drive,
      empleados,
      {
        spreadsheetId,
        sheetName,
        rootFolderId,
        storageAccessToken: token,
        sheets,
      }
    );

    if (result.updatedWorkbook) {
      await drive.files.update({
        fileId: spreadsheetId,
        supportsAllDrives: true,
        media: {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: Readable.from([result.updatedWorkbook]),
        },
        fields: "id",
      });
    }

    return response.json({
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
    logGoogleError("Error sincronizando empleados con Drive y Excel:", error);
    return response.status(500).json({
      error: googleErrorMessage(error),
    });
  }
});

app.delete("/api/empleados/:cedula", async (request, response) => {
  const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!(await isAdminToken(token))) {
    return response.status(401).json({ error: "Debes iniciar sesión como administrador." });
  }

  const cedula = String(request.params.cedula || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(cedula)) {
    return response.status(400).json({ error: "La cédula del empleado no es válida." });
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || "Empleados";
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!spreadsheetId || !rootFolderId) {
    return response.status(500).json({
      error: "Falta configurar GOOGLE_SPREADSHEET_ID o GOOGLE_DRIVE_FOLDER_ID.",
    });
  }

  try {
    const drive = await getDrive();
    const sheets = google.sheets({
      version: "v4",
      auth: getGoogleAuth(["https://www.googleapis.com/auth/drive"]),
    });
    const result = await deleteEmployeeDriveAndExcel(drive, {
      cedula,
      rootFolderId,
      spreadsheetId,
      sheetName,
      sheets,
    });
    return response.json({ ok: true, ...result });
  } catch (error) {
    logGoogleError("Error eliminando datos del empleado de Drive y Excel:", error);
    return response.status(500).json({ error: googleErrorMessage(error) });
  }
});

app.get("/auth/google/callback", async (request, response) => {
  try {
    const auth = getOAuthClient();
    const { tokens } = await auth.getToken(request.query.code);
    fs.writeFileSync(
      path.join(backendDirectory, ".drive-token.json"),
      JSON.stringify(tokens, null, 2)
    );
    response.send("Google Drive autorizado correctamente. Ya puedes cerrar esta ventana.");
  } catch (error) {
    logGoogleError("Error autorizando Google Drive:", error);
    response.status(500).send(googleErrorMessage(error));
  }
});

async function findOrCreateFolder(drive, name, parentId) {
  const escapedName = name.replace(/'/g, "\\'");
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `'${parentId}' in parents`,
    `name = '${escapedName}'`,
  ].join(" and ");

  const result = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (result.data.files?.[0]) return result.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  return created.data.id;
}

async function getDestinationFolder(drive, cedula, nombreCompleto) {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootId) {
    throw new Error("Falta GOOGLE_DRIVE_FOLDER_ID en el archivo .env.");
  }

  return findOrCreateFolder(
    drive,
    getEmployeeDriveFolderName(cedula, nombreCompleto),
    rootId
  );
}

app.post("/api/contratos/aceptar", async (request, response) => {
  const cedula = String(request.body?.cedula || "").trim();
  try {
    const result = await signPublishedContracts({
      drive: await getDrive(),
      cedula,
      fileIds: request.body?.fileIds,
    });
    return response.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("Error firmando contratos aceptados:", error);
    return response.status(error?.status || 500).json({
      error: error?.message || "No se pudieron aceptar los documentos.",
    });
  }
});

app.get("/api/archivos", async (request, response) => {
  const { fileId, cedula } = request.query;
  if (request.query.accion === "contrato-empleado") {
    const publishedContract = await getPublishedContractForEmployee(cedula, fileId);
    if (publishedContract.error) {
      return response.status(publishedContract.status).json({ error: publishedContract.error });
    }

    try {
      const drive = await getDrive();
      const { data: file } = await drive.files.get({
        fileId: publishedContract.fileId,
        fields: "name,mimeType,parents",
        supportsAllDrives: true,
      });

      const { data: folder } = await drive.files.get({
        fileId: file.parents?.[0],
        fields: "name",
        supportsAllDrives: true,
      });
      if (!folder.name.startsWith(`${cedula}_`)) {
        return response.status(403).json({ error: "El contrato no pertenece a la carpeta de este empleado." });
      }

      const fileBuffer = await getPublishedContractPdf(drive, {
        fileId: publishedContract.fileId,
        mimeType: file.mimeType,
        name: file.name || publishedContract.fileName,
        parents: file.parents,
      });
      const disposition = request.query.descargar === "true" ? "attachment" : "inline";
      const fileName = publishedContract.fileName
        .replace(/\.[^.]+$/, ".pdf")
        .replace(/[\r\n"\\]/g, "_");
      response.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      return response.send(fileBuffer);
    } catch (error) {
      logGoogleError("Error sirviendo el contrato del empleado:", error);
      if (isGoogleFileNotFound(error)) {
        return response.status(404).json({ error: "Drive no encuentra el contrato publicado." });
      }
      return response.status(500).json({ error: googleErrorMessage(error) });
    }
  }

  const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!(await isAdminToken(token))) {
    return response.status(401).json({ error: "Debes iniciar sesión como administrador." });
  }
  if (!fileId || !cedula || !/^[a-zA-Z0-9_-]+$/.test(cedula)) {
    return response.status(400).json({ error: "La firma solicitada no es válida." });
  }

  try {
    const drive = await getDrive();
    const { data: file } = await drive.files.get({
      fileId,
      fields: "name,mimeType,parents",
      supportsAllDrives: true,
    });
    if (!["image/png", "image/jpeg"].includes(file.mimeType)) {
      return response.status(415).json({ error: "La firma debe ser PNG o JPG." });
    }

    const { data: signatureFolder } = await drive.files.get({
      fileId: file.parents?.[0],
      fields: "name,parents",
      supportsAllDrives: true,
    });
    const isFlatEmployeeFolder = signatureFolder.name.startsWith(`${cedula}_`)
      && file.name.startsWith(`${cedula}_`);
    let belongsToEmployee = isFlatEmployeeFolder;
    if (signatureFolder.name === "firmas" && signatureFolder.parents?.[0]) {
      const { data: employeeFolder } = await drive.files.get({
        fileId: signatureFolder.parents[0],
        fields: "name",
        supportsAllDrives: true,
      });
      belongsToEmployee = employeeFolder.name === cedula;
    }
    if (!belongsToEmployee) {
      return response.status(403).json({ error: "La firma no pertenece a este empleado." });
    }

    const image = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    response.set("Cache-Control", "private, no-store");
    return response.type(file.mimeType).send(Buffer.from(image.data));
  } catch (error) {
    logGoogleError("Error leyendo firma de Google Drive:", error);
    if (isGoogleFileNotFound(error)) {
      return response.status(404).json({
        error: "Drive no encuentra el archivo de firma guardado. Vuelve a cargar la firma del empleado desde Documentos y genera otra vez el borrador.",
      });
    }
    if (error?.response?.status === 403) {
      return response.status(403).json({
        error: "La cuenta conectada a Drive no tiene permiso para leer esta firma.",
      });
    }
    return response.status(500).json({
      error: googleErrorMessage(error),
    });
  }
});

const eliminarArchivoContrato = async (request, response) => {
  const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!(await isAdminToken(token))) {
    return response.status(401).json({ error: "Debes iniciar sesión como administrador." });
  }

  const { fileId, cedula, carpeta } = request.query;
  if (
    !/^[a-zA-Z0-9_-]+$/.test(fileId)
    || !/^[a-zA-Z0-9_-]+$/.test(String(cedula || ""))
    || !["contratos", "contratos-firmados"].includes(carpeta)
  ) {
    return response.status(400).json({ error: "El archivo del contrato no es válido." });
  }

  try {
    const drive = await getDrive();
    let file;
    try {
      ({ data: file } = await drive.files.get({
        fileId,
        fields: "name,parents,trashed",
        supportsAllDrives: true,
      }));
    } catch (error) {
      if (isGoogleFileNotFound(error)) {
        return response.status(200).json({ ok: true, alreadyDeleted: true });
      }
      throw error;
    }
    if (file.trashed || !file.parents?.length) {
      return response.status(200).json({ ok: true, alreadyDeleted: true });
    }

    if (!await belongsToEmployeeContractFolder(drive, file, cedula, carpeta)) {
      return response.status(403).json({ error: "El archivo no pertenece a una carpeta de contratos." });
    }

    try {
      await drive.files.delete({ fileId, supportsAllDrives: true });
    } catch (error) {
      if (!isGoogleFileNotFound(error)) throw error;
    }
    return response.status(200).json({ ok: true });
  } catch (error) {
    logGoogleError("Error eliminando contrato de Google Drive:", error);
    return response.status(500).json({ error: googleErrorMessage(error) });
  }
};

app.delete("/api/archivos", eliminarArchivoContrato);
app.post("/api/archivos", (request, response, next) => {
  if (request.query.accion !== "eliminar-contrato") return next();
  return eliminarArchivoContrato(request, response);
});

app.post("/api/archivos", upload.single("archivo"), async (request, response) => {
  try {
    const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const carpeta = String(request.body.carpeta || "documentos").trim();
    const esSubidaFirmada = carpeta === "contratos-firmados";
    const esSubidaPublica = isPublicFormUploadFolder(carpeta);

    if (!esSubidaFirmada && !esSubidaPublica && !(await isAdminToken(token))) {
      return response.status(401).json({ error: "Debes iniciar sesión como administrador." });
    }

    if (!request.file) {
      return response.status(400).json({ error: "Debes enviar un archivo." });
    }
    if (String(request.body.soloVistaPrevia || "") === "true") {
      const nombreWord = String(request.file.originalname || "vista-previa.docx");
      if (esSubidaFirmada || esSubidaPublica || !isWordDocumentName(nombreWord)) {
        return response.status(400).json({ error: "La vista previa requiere un archivo Word .doc o .docx." });
      }
      const pdf = await convertWordToPdf(await getDrive(), {
        buffer: request.file.buffer,
        name: nombreWord,
        mimeType: getWordMimeType(nombreWord),
      });
      return response.json({ pdfBase64: pdf.toString("base64") });
    }
    if (esSubidaPublica) {
      const validationError = validatePublicFormUpload(carpeta, {
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
      });
      if (validationError) return response.status(400).json({ error: validationError });
    }

    const cedula = String(request.body.cedula || "").trim();
    const nombreCompleto = String(request.body.nombreCompleto || "").trim();

    if (!cedula || !/^[a-zA-Z0-9_-]+$/.test(cedula)) {
      return response.status(400).json({ error: "La cédula no es válida." });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(carpeta)) {
      return response.status(400).json({ error: "La carpeta no es válida." });
    }

    const drive = await getDrive();
    const folderId = await getDestinationFolder(drive, cedula, nombreCompleto);
    const nombreArchivo = getDriveUploadFileName({
      cedula,
      nombreCompleto,
      carpeta,
      documento: request.body.documento,
      originalName: request.file.originalname,
      mimeType: request.file.mimetype,
    });
    const extensionArchivo = nombreArchivo.toLowerCase();
    const mimeType = extensionArchivo.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : extensionArchivo.endsWith(".pdf")
        ? "application/pdf"
        : request.file.mimetype || "application/octet-stream";

    if (String(request.body.convertirAPdf || "") === "true") {
      if (!isWordDocumentName(nombreArchivo) || mimeType !== getWordMimeType(nombreArchivo)) {
        return response.status(400).json({ error: "Para generar el PDF se debe enviar un archivo Word .doc o .docx válido." });
      }
      const created = await uploadWordAsPdf(drive, {
        buffer: request.file.buffer,
        name: nombreArchivo,
        parents: [folderId],
        mimeType,
      });

      return response.status(201).json({
        id: created.data.id,
        nombre: created.data.name,
        url: `https://drive.google.com/uc?export=download&id=${created.data.id}`,
        vistaUrl: `https://drive.google.com/file/d/${created.data.id}/view`,
      });
    }

    const created = await drive.files.create({
      requestBody: {
        name: nombreArchivo,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from([request.file.buffer]),
      },
      fields: "id, name, webViewLink, webContentLink",
      supportsAllDrives: true,
    });

    if (process.env.DRIVE_PUBLIC_FILES === "true" || carpeta === "contratos-firmados") {
      try {
        await drive.permissions.create({
          fileId: created.data.id,
          requestBody: { type: "anyone", role: "reader" },
          supportsAllDrives: true,
        });
      } catch (permissionError) {
        console.warn(
          "El archivo se subió, pero no se pudo aplicar permiso público:",
          permissionError.message
        );
      }
    }

    return response.status(201).json({
      id: created.data.id,
      nombre: created.data.name,
      url: `https://drive.google.com/uc?export=download&id=${created.data.id}`,
      vistaUrl: `https://drive.google.com/file/d/${created.data.id}/view`,
    });
  } catch (error) {
    logGoogleError("Error subiendo archivo a Google Drive:", error);
    return response.status(googleErrorCode(error) === "invalid_grant" ? 401 : 500).json({
      error: googleErrorMessage(error),
    });
  }
});

app.use((error, _request, response, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return response.status(413).json({ error: "El archivo no puede superar 10 MB." });
  }

  console.error("Error en solicitud HTTP:", {
    name: error?.name || "Error",
    code: error?.code || "unknown",
    status: error?.status || null,
  });
  next(error);
});

app.listen(port, () => {
  console.log(`Backend de Google Drive activo en http://localhost:${port}`);
});
