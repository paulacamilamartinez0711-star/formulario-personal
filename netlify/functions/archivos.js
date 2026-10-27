import Busboy from "busboy";
import { Buffer } from "node:buffer";
import process from "node:process";
import { Readable } from "node:stream";
import { getDestinationFolder, getDrive } from "./_drive.js";
import { getDriveUploadFileName } from "../../shared/driveNaming.js";
import { belongsToEmployeeContractFolder } from "../../shared/driveContractOwnership.js";
import {
  convertWordToPdf,
  getPublishedContractPdf,
  getWordMimeType,
  isWordDocumentName,
  uploadWordAsPdf,
} from "../../shared/drivePdfConversion.js";
import { getPublishedContractForEmployee } from "../../shared/employeeContractAccess.js";
import { signPublishedContracts } from "../../shared/contractSigning.js";
import { isAdminToken } from "../../shared/supabaseAdminAuth.js";
import {
  isPublicFormUploadFolder,
  validatePublicFormUpload,
} from "../../shared/uploadPolicy.js";

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

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
    return "La autorización de Google Drive expiró o fue revocada. Vuelve a autorizarla y despliega de nuevo.";
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
  });
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType?.startsWith("multipart/form-data")) {
      reject(new Error("La solicitud debe usar multipart/form-data."));
      return;
    }

    const fields = {};
    let file;
    const parser = Busboy({ headers: { "content-type": contentType } });

    parser.on("field", (name, value) => {
      fields[name] = value;
    });
    parser.on("file", (name, stream, info) => {
      if (name !== "archivo") {
        stream.resume();
        return;
      }

      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        file = {
          buffer: Buffer.concat(chunks),
          filename: info.filename,
          mimeType: info.mimeType,
        };
      });
    });
    parser.on("error", reject);
    parser.on("finish", () => resolve({ fields, file }));

    const body = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    parser.end(body);
  });
}

export async function handler(event) {
  if (event.httpMethod === "GET") {
    const { fileId, cedula } = event.queryStringParameters || {};
    if (event.queryStringParameters?.accion === "contrato-empleado") {
      const publishedContract = await getPublishedContractForEmployee(cedula, fileId);
      if (publishedContract.error) {
        return response(publishedContract.status, { error: publishedContract.error });
      }

      try {
        const drive = getDrive();
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
          return response(403, { error: "El contrato no pertenece a la carpeta de este empleado." });
        }

        const fileBuffer = await getPublishedContractPdf(drive, {
          fileId: publishedContract.fileId,
          mimeType: file.mimeType,
          name: file.name || publishedContract.fileName,
          parents: file.parents,
        });
        const disposition = event.queryStringParameters?.descargar === "true"
          ? "attachment"
          : "inline";
        const fileName = publishedContract.fileName
          .replace(/\.[^.]+$/, ".pdf")
          .replace(/[\r\n"\\]/g, "_");
        return {
          statusCode: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `${disposition}; filename="${fileName}"`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
          body: fileBuffer.toString("base64"),
          isBase64Encoded: true,
        };
      } catch (error) {
        logGoogleError("Error sirviendo el contrato del empleado:", error);
        if (isGoogleFileNotFound(error)) {
          return response(404, { error: "Drive no encuentra el contrato publicado." });
        }
        return response(500, { error: googleErrorMessage(error) });
      }
    }

    const authorization = event.headers.authorization || event.headers.Authorization || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!(await isAdminToken(token))) {
      return response(401, { error: "Debes iniciar sesión como administrador." });
    }
    if (!fileId || !cedula || !/^[a-zA-Z0-9_-]+$/.test(cedula)) {
      return response(400, { error: "La firma solicitada no es válida." });
    }

    try {
      const drive = getDrive();
      const { data: file } = await drive.files.get({
        fileId,
        fields: "name,mimeType,parents",
        supportsAllDrives: true,
      });
      if (!["image/png", "image/jpeg"].includes(file.mimeType)) {
        return response(415, { error: "La firma debe ser PNG o JPG." });
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
        return response(403, { error: "La firma no pertenece a este empleado." });
      }

      const image = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" }
      );
      return {
        statusCode: 200,
        headers: {
          "content-type": file.mimeType,
          "cache-control": "private, no-store",
        },
        body: Buffer.from(image.data).toString("base64"),
        isBase64Encoded: true,
      };
    } catch (error) {
      logGoogleError("Error leyendo firma de Google Drive:", error);
      if (isGoogleFileNotFound(error)) {
        return response(404, {
          error: "Drive no encuentra el archivo de firma guardado. Vuelve a cargar la firma del empleado desde Documentos y genera otra vez el borrador.",
        });
      }
      if (error?.response?.status === 403) {
        return response(403, {
          error: "La cuenta conectada a Drive no tiene permiso para leer esta firma.",
        });
      }
      return response(500, { error: googleErrorMessage(error) });
    }
  }

  if (
    event.httpMethod === "DELETE"
    || (
      event.httpMethod === "POST"
      && event.queryStringParameters?.accion === "eliminar-contrato"
    )
  ) {
    const { fileId, cedula, carpeta } = event.queryStringParameters || {};
    const headers = event.headers || {};
    const authorization = headers.authorization || headers.Authorization || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    let esAdmin;
    try {
      esAdmin = await isAdminToken(token);
    } catch (error) {
      console.error("No se pudo verificar administrador para eliminar contrato:", error?.message);
      return response(503, { error: "No se pudo verificar la sesión. Intenta de nuevo." });
    }
    if (!esAdmin) {
      return response(401, { error: "Debes iniciar sesión como administrador." });
    }
    if (
      !/^[a-zA-Z0-9_-]+$/.test(String(fileId || ""))
      || !/^[a-zA-Z0-9_-]+$/.test(String(cedula || ""))
      || !["contratos", "contratos-firmados"].includes(carpeta)
    ) {
      return response(400, { error: "El archivo del contrato no es válido." });
    }

    try {
      const drive = getDrive();
      let file;
      try {
        ({ data: file } = await drive.files.get({
          fileId,
          fields: "name,parents,trashed",
          supportsAllDrives: true,
        }));
      } catch (error) {
        if (isGoogleFileNotFound(error)) {
          return response(200, { ok: true, alreadyDeleted: true });
        }
        throw error;
      }
      if (file.trashed || !file.parents?.length) {
        return response(200, { ok: true, alreadyDeleted: true });
      }

      if (!await belongsToEmployeeContractFolder(drive, file, cedula, carpeta)) {
        return response(403, { error: "El contrato no pertenece a este empleado." });
      }

      try {
        await drive.files.delete({ fileId, supportsAllDrives: true });
      } catch (error) {
        if (!isGoogleFileNotFound(error)) throw error;
      }
      return response(200, { ok: true });
    } catch (error) {
      logGoogleError("Error eliminando contrato de Google Drive:", error);
      return response(500, { error: googleErrorMessage(error) });
    }
  }

  if (event.httpMethod !== "POST") return response(405, { error: "Método no permitido." });

  try {
    if ((event.headers["content-type"] || event.headers["Content-Type"] || "").includes("application/json")
      && (event.path?.endsWith("/contratos/aceptar")
        || event.queryStringParameters?.accion === "aceptar-contratos")) {
      const body = JSON.parse(event.body || "{}");
      const result = await signPublishedContracts({
        drive: getDrive(),
        cedula: String(body.cedula || "").trim(),
        fileIds: body.fileIds,
      });
      return response(200, { ok: true, ...result });
    }
    const { fields, file } = await parseMultipart(event);
    if (!file?.buffer?.length) return response(400, { error: "Debes enviar un archivo." });

    const cedula = String(fields.cedula || "").trim();
    const nombreCompleto = String(fields.nombreCompleto || "").trim();
    const carpeta = String(fields.carpeta || "documentos").trim();
    const authorization = event.headers.authorization || event.headers.Authorization || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    const isPublicUpload = isPublicFormUploadFolder(carpeta);
    if (!isPublicUpload && !(await isAdminToken(token))) {
      return response(401, { error: "Debes iniciar sesión como administrador." });
    }
    if (String(fields.soloVistaPrevia || "") === "true") {
      const nombreWord = String(file.filename || "vista-previa.docx");
      if (isPublicUpload || !isWordDocumentName(nombreWord)) {
        return response(400, { error: "La vista previa requiere un archivo Word .doc o .docx." });
      }
      const pdf = await convertWordToPdf(getDrive(), {
        buffer: file.buffer,
        name: nombreWord,
        mimeType: getWordMimeType(nombreWord),
      });
      return response(200, { pdfBase64: pdf.toString("base64") });
    }
    if (isPublicUpload) {
      const validationError = validatePublicFormUpload(carpeta, file);
      if (validationError) return response(400, { error: validationError });
    }

    if (!cedula || !/^[a-zA-Z0-9_-]+$/.test(cedula)) {
      return response(400, { error: "La cédula no es válida." });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(carpeta)) {
      return response(400, { error: "La carpeta no es válida." });
    }

    const drive = getDrive();
    const folderId = await getDestinationFolder(drive, cedula, nombreCompleto);
    const nombreArchivo = getDriveUploadFileName({
      cedula,
      nombreCompleto,
      carpeta,
      documento: fields.documento,
      originalName: file.filename,
      mimeType: file.mimeType,
    });
    const extensionArchivo = nombreArchivo.toLowerCase();
    const mimeType = extensionArchivo.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : extensionArchivo.endsWith(".pdf")
        ? "application/pdf"
        : file.mimeType || "application/octet-stream";
    if (String(fields.convertirAPdf || "") === "true") {
      if (!isWordDocumentName(nombreArchivo) || mimeType !== getWordMimeType(nombreArchivo)) {
        return response(400, { error: "Para generar el PDF se debe enviar un archivo Word .doc o .docx válido." });
      }
      const created = await uploadWordAsPdf(drive, {
        buffer: file.buffer,
        name: nombreArchivo,
        parents: [folderId],
        mimeType,
      });

      return response(201, {
        id: created.data.id,
        nombre: created.data.name,
        url: `https://drive.google.com/uc?export=download&id=${created.data.id}`,
        vistaUrl: `https://drive.google.com/file/d/${created.data.id}/view`,
      });
    }
    const created = await drive.files.create({
      requestBody: { name: nombreArchivo, parents: [folderId] },
      media: {
        mimeType,
        body: Readable.from([file.buffer]),
      },
      fields: "id, name",
      supportsAllDrives: true,
    });

    if (process.env.DRIVE_PUBLIC_FILES === "true") {
      await drive.permissions.create({
        fileId: created.data.id,
        requestBody: { type: "anyone", role: "reader" },
        supportsAllDrives: true,
      });
    }

    return response(201, {
      id: created.data.id,
      nombre: created.data.name,
      url: `https://drive.google.com/uc?export=download&id=${created.data.id}`,
      vistaUrl: `https://drive.google.com/file/d/${created.data.id}/view`,
    });
  } catch (error) {
    logGoogleError("Error subiendo archivo a Google Drive:", error);
    return response(googleErrorCode(error) === "invalid_grant" ? 401 : 500, {
      error: googleErrorMessage(error),
    });
  }
}
