import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { appendEmployeeRowToXlsx, upsertEmployeeRowInGoogleSheet } from "./xlsxEmployees.js";
import {
  getEmployeeDriveDocumentName,
  getEmployeeDriveFolderName,
} from "./driveNaming.js";
import { supabaseKey, supabaseUrl } from "../src/supabase.js";

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const SUPABASE_STORAGE_BUCKET = "documentos-empleados";
const DOCUMENT_FIELDS = [
  "cedula_frente_url",
  "cedula_respaldo_url",
  "certificado_bancario_url",
  "certificado_eps_url",
  "certificado_pension_url",
  "fotografia_url",
  "firma_url",
  "contrato_url",
  "contrato_firmado_url",
];

function isGoogleFileNotFound(error) {
  return error?.response?.status === 404
    || error?.status === 404
    || error?.code?.code === 404;
}

function getDriveFileId(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!["drive.google.com", "docs.google.com"].includes(url.hostname)) return null;

    const idFromQuery = url.searchParams.get("id");
    const idFromPath = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
    const id = idFromQuery || idFromPath;
    return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function findOrCreateFolder(drive, name, parentId) {
  const escapedName = name.replace(/'/g, "\\'");
  const result = await drive.files.list({
    q: [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `'${parentId}' in parents`,
      `name = '${escapedName}'`,
    ].join(" and "),
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (result.data.files?.[0]) return { id: result.data.files[0].id, created: false };

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return { id: created.data.id, created: true };
}

async function listFolderFiles(drive, folderId) {
  const result = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,appProperties)",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return result.data.files || [];
}

async function ensureEmployeeDocumentName(drive, file, employee, field) {
  const name = getEmployeeDriveDocumentName({
    cedula: employee.cedula,
    nombreCompleto: employee.nombre_completo,
    field,
    originalName: file.name,
    mimeType: file.mimeType,
  });
  if (file.name === name) return file;

  const updated = await drive.files.update({
    fileId: file.id,
    requestBody: { name },
    fields: "id,name,mimeType,appProperties",
    supportsAllDrives: true,
  });
  return updated.data;
}

async function findDriveFile(drive, fileId) {
  try {
    const result = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,parents,trashed,appProperties",
      supportsAllDrives: true,
    });
    return result.data;
  } catch (error) {
    if (isGoogleFileNotFound(error)) return null;
    throw error;
  }
}

async function moveEmployeeDocument(drive, file, employee, field, folderId) {
  const name = getEmployeeDriveDocumentName({
    cedula: employee.cedula,
    nombreCompleto: employee.nombre_completo,
    field,
    originalName: file.name,
    mimeType: file.mimeType,
  });
  const alreadyInFolder = file.parents?.includes(folderId) || false;
  if (alreadyInFolder && file.name === name) {
    return { file, moved: false, renamed: false };
  }

  const parentsToRemove = (file.parents || []).filter((parentId) => parentId !== folderId);
  const updated = await drive.files.update({
    fileId: file.id,
    ...(alreadyInFolder ? {} : { addParents: folderId }),
    ...(parentsToRemove.length ? { removeParents: parentsToRemove.join(",") } : {}),
    requestBody: { name },
    fields: "id,name,mimeType,parents,appProperties",
    supportsAllDrives: true,
  });
  return {
    file: updated.data,
    moved: !alreadyInFolder,
    renamed: file.name !== name,
  };
}

async function reconcileDriveEmployeeDocument(
  drive,
  sourceFile,
  employee,
  field,
  folderId,
  duplicateCopy = null
) {
  let fileToKeep = sourceFile;
  let copyToTrash = duplicateCopy;
  const managedCopy = duplicateCopy || (
    sourceFile.appProperties?.syncField === field
      && sourceFile.appProperties?.syncCedula === String(employee.cedula)
      ? sourceFile
      : null
  );
  const originalFileId = duplicateCopy
    ? duplicateCopy.appProperties?.syncSourceId
    : managedCopy?.appProperties?.syncSourceId;

  if (managedCopy && originalFileId && originalFileId !== managedCopy.id) {
    const original = await findDriveFile(drive, originalFileId);
    if (original && !original.trashed) {
      fileToKeep = original;
      copyToTrash = managedCopy;
    } else if (duplicateCopy) {
      fileToKeep = duplicateCopy;
      copyToTrash = null;
    }
  }

  if (fileToKeep.trashed) {
    throw new Error(`El documento de ${employee.cedula} (${field}) está en la papelera de Drive.`);
  }

  const result = await moveEmployeeDocument(
    drive,
    fileToKeep,
    employee,
    field,
    folderId
  );

  if (result.moved && process.env.DRIVE_PUBLIC_FILES === "true") {
    try {
      await drive.permissions.create({
        fileId: result.file.id,
        requestBody: { type: "anyone", role: "reader" },
        supportsAllDrives: true,
      });
    } catch (error) {
      console.warn("No se pudo aplicar permiso de lectura pública al documento sincronizado:", {
        fileId: result.file.id,
        message: error?.message || "Error sin mensaje",
      });
    }
  }

  if (copyToTrash && copyToTrash.id !== result.file.id) {
    await drive.files.update({
      fileId: copyToTrash.id,
      requestBody: { trashed: true },
      fields: "id,trashed",
      supportsAllDrives: true,
    });
  }

  return {
    ...result,
    deduplicated: Boolean(copyToTrash && copyToTrash.id !== result.file.id),
  };
}

function getDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

function getStorageSyncId(url) {
  return `storage:${createHash("sha256").update(url).digest("hex")}`;
}

function getSupabaseStoragePath(sourceValue) {
  const source = String(sourceValue || "").trim();
  if (!source) return null;

  let pathname = source;
  let isAbsoluteUrl = false;
  try {
    const url = new URL(source);
    isAbsoluteUrl = true;
    if (url.origin !== new URL(supabaseUrl).origin) return null;
    pathname = url.pathname;
  } catch {
    if (/^[a-z][a-z\d+.-]*:/i.test(source)) return null;
  }

  const pathParts = pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const bucketIndex = pathParts.indexOf(SUPABASE_STORAGE_BUCKET);
  if (bucketIndex >= 0) {
    const hasStoragePrefix = pathParts[bucketIndex - 1] === "public"
      || pathParts[bucketIndex - 1] === "sign"
      || pathParts[bucketIndex - 1] === "authenticated";
    const hasApiPrefix = pathParts[bucketIndex - 1] === "object";
    if (hasStoragePrefix || hasApiPrefix) {
      return pathParts.slice(bucketIndex + 1).join("/");
    }
    if (bucketIndex === 0) return pathParts.slice(1).join("/");
  }
  return isAbsoluteUrl || source.startsWith("/") ? null : pathParts.join("/");
}

async function downloadSupabaseStorageObject(storage, path) {
  const result = await storage.from(SUPABASE_STORAGE_BUCKET).download(path);
  if (!result.error) return result.data;
  throw result.error;
}

async function copySupabaseStorageDocument(drive, employee, field, sourceUrl, folderId, storage) {
  const storagePath = getSupabaseStoragePath(sourceUrl);
  if (!storagePath) return null;

  const syncSourceId = getStorageSyncId(storagePath);
  const existingCopy = (await listFolderFiles(drive, folderId)).find(
    (file) => file.appProperties?.syncSourceId === syncSourceId
      && file.appProperties?.syncField === field
  );
  if (existingCopy) {
    const namedCopy = await ensureEmployeeDocumentName(drive, existingCopy, employee, field);
    return { file: namedCopy, alreadyCopied: true };
  }

  try {
    const blob = await downloadSupabaseStorageObject(storage, storagePath);
    if (!blob) {
      return { error: "Supabase Storage no devolvió el archivo." };
    }
    if (blob.size > MAX_DOCUMENT_SIZE) {
      return { error: "El documento supera el límite de 10 MB para sincronización." };
    }

    const content = Buffer.from(await blob.arrayBuffer());

    const originalName = storagePath.split("/").at(-1) || `${field}.bin`;
    const mimeType = blob.type
      || "application/octet-stream";
    const name = getEmployeeDriveDocumentName({
      cedula: employee.cedula,
      nombreCompleto: employee.nombre_completo,
      field,
      originalName,
      mimeType,
    });
    const created = await drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
        appProperties: {
          syncSourceId,
          syncField: field,
          syncCedula: String(employee.cedula),
        },
      },
      media: {
        mimeType,
        body: Readable.from([content]),
      },
      fields: "id,name,mimeType,appProperties",
      supportsAllDrives: true,
    });

    if (process.env.DRIVE_PUBLIC_FILES === "true") {
      try {
        await drive.permissions.create({
          fileId: created.data.id,
          requestBody: { type: "anyone", role: "reader" },
          supportsAllDrives: true,
        });
      } catch (error) {
        console.warn("No se pudo aplicar permiso de lectura pública al documento sincronizado:", {
          fileId: created.data.id,
          message: error?.message || "Error sin mensaje",
        });
      }
    }

    return { file: created.data };
  } catch (error) {
    return { error: `No se pudo copiar el documento desde Storage: ${error?.message || "Error de descarga."}` };
  }
}

async function copyEmployeeDocuments(drive, employee, folderId, storage) {
  const filesInFolder = await listFolderFiles(drive, folderId);
  const documentUrls = {};
  const unresolvedDocuments = [];
  let filesCopied = 0;
  let filesAlreadyInFolder = 0;
  let filesMoved = 0;
  let filesRenamed = 0;
  let filesDeduplicated = 0;

  for (const field of DOCUMENT_FIELDS) {
    const sourceUrl = employee[field];
    if (!sourceUrl) continue;

    const sourceFileId = getDriveFileId(sourceUrl);
    if (!sourceFileId) {
      const storageCopy = await copySupabaseStorageDocument(
        drive,
        employee,
        field,
        sourceUrl,
        folderId,
        storage
      );
      if (!storageCopy) {
        unresolvedDocuments.push({
          field,
          reason: "El enlace no corresponde a un archivo de Google Drive ni a Storage compatible.",
        });
        continue;
      }
      if (storageCopy.error) {
        unresolvedDocuments.push({ field, reason: storageCopy.error });
        continue;
      }

      filesInFolder.push(storageCopy.file);
      documentUrls[field] = getDownloadUrl(storageCopy.file.id);
      if (storageCopy.alreadyCopied) filesAlreadyInFolder += 1;
      else filesCopied += 1;
      continue;
    }

    const existingCopy = filesInFolder.find(
      (file) => file.appProperties?.syncSourceId === sourceFileId
        && file.appProperties?.syncField === field
        && file.appProperties?.syncCedula === String(employee.cedula)
    );
    const sourceFile = await findDriveFile(drive, sourceFileId);
    if (!sourceFile && existingCopy) {
      const reconciled = await reconcileDriveEmployeeDocument(
        drive,
        existingCopy,
        employee,
        field,
        folderId
      );
      documentUrls[field] = getDownloadUrl(reconciled.file.id);
      filesAlreadyInFolder += 1;
      filesRenamed += Number(reconciled.renamed);
      continue;
    }
    if (!sourceFile) {
      unresolvedDocuments.push({ field, reason: "Drive no encuentra el archivo indicado." });
      continue;
    }

    if (sourceFile.trashed) {
      unresolvedDocuments.push({ field, reason: "El archivo está en la papelera de Drive." });
      continue;
    }

    const managedCopy = sourceFile.appProperties?.syncField === field
      && sourceFile.appProperties?.syncCedula === String(employee.cedula)
      ? sourceFile
      : null;
    const reconciled = await reconcileDriveEmployeeDocument(
      drive,
      sourceFile,
      employee,
      field,
      folderId,
      existingCopy || managedCopy
    );
    filesMoved += Number(reconciled.moved);
    filesRenamed += Number(reconciled.renamed);
    filesDeduplicated += Number(reconciled.deduplicated);
    if (!reconciled.moved && !reconciled.renamed && !reconciled.deduplicated) {
      filesAlreadyInFolder += 1;
    }
    documentUrls[field] = getDownloadUrl(reconciled.file.id);
  }

  return {
    documentUrls,
    unresolvedDocuments,
    filesCopied,
    filesAlreadyInFolder,
    filesMoved,
    filesRenamed,
    filesDeduplicated,
  };
}

export async function syncEmployeesToDriveAndExcel(
  drive,
  employees,
  { spreadsheetId, sheetName, rootFolderId, storageAccessToken, sheets }
) {
  if (!spreadsheetId) throw new Error("Falta GOOGLE_SPREADSHEET_ID.");
  if (!rootFolderId) throw new Error("Falta GOOGLE_DRIVE_FOLDER_ID.");
  if (!Array.isArray(employees) || !employees.length) {
    throw new Error("Debes enviar al menos un empleado para sincronizar.");
  }
  if (employees.length > 25) {
    throw new Error("Sincroniza máximo 25 empleados por solicitud.");
  }
  if (employees.some((employee) => (
    !employee
    || !/^[a-zA-Z0-9_-]+$/.test(String(employee.cedula || ""))
    || !String(employee.nombre_completo || "").trim()
  ))) {
    throw new Error("Hay empleados sin cédula o nombre válido.");
  }

  const { data: workbookFile } = await drive.files.get({
    fileId: spreadsheetId,
    fields: "name,mimeType",
    supportsAllDrives: true,
  });
  const isGoogleSheet = workbookFile.mimeType === GOOGLE_SHEET_MIME_TYPE;
  if (isGoogleSheet && !sheets) {
    throw new Error("Falta el cliente de Google Sheets.");
  }
  if (!isGoogleSheet && workbookFile.mimeType !== XLSX_MIME_TYPE) {
    throw new Error(
      `El archivo "${workbookFile.name}" no es un Excel .xlsx ni una Hoja de Google compatible.`
    );
  }

  const download = isGoogleSheet ? null : await drive.files.get(
    { fileId: spreadsheetId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  const storage = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: storageAccessToken
        ? { Authorization: `Bearer ${storageAccessToken}` }
        : {},
    },
  }).storage;
  let updatedWorkbook = download ? Buffer.from(download.data) : null;
  let foldersCreated = 0;
  let filesCopied = 0;
  let filesAlreadyInFolder = 0;
  let filesMoved = 0;
  let filesRenamed = 0;
  let filesDeduplicated = 0;
  const results = [];

  for (const employee of employees) {
    const folder = await findOrCreateFolder(
      drive,
      getEmployeeDriveFolderName(employee.cedula, employee.nombre_completo),
      rootFolderId
    );
    if (folder.created) foldersCreated += 1;

    const documentResult = await copyEmployeeDocuments(drive, employee, folder.id, storage);
    filesCopied += documentResult.filesCopied;
    filesAlreadyInFolder += documentResult.filesAlreadyInFolder;
    filesMoved += documentResult.filesMoved;
    filesRenamed += documentResult.filesRenamed;
    filesDeduplicated += documentResult.filesDeduplicated;

    const updatedEmployee = { ...employee, ...documentResult.documentUrls };
    const headers = Object.keys(updatedEmployee);
    if (isGoogleSheet) {
      await upsertEmployeeRowInGoogleSheet(sheets, {
        spreadsheetId,
        sheetName,
        headers,
        values: headers.map((header) => updatedEmployee[header]),
      });
    } else {
      updatedWorkbook = appendEmployeeRowToXlsx(updatedWorkbook, {
        sheetName,
        headers,
        values: headers.map((header) => updatedEmployee[header]),
      });
    }
    results.push({
      id: employee.id,
      cedula: employee.cedula,
      documentUrls: documentResult.documentUrls,
      unresolvedDocuments: documentResult.unresolvedDocuments,
    });
  }

  return {
    updatedWorkbook,
    results,
    foldersCreated,
    filesCopied,
    filesAlreadyInFolder,
    filesMoved,
    filesRenamed,
    filesDeduplicated,
  };
}
