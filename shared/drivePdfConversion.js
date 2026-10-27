import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME_TYPE = "application/msword";
const GOOGLE_DOC_MIME_TYPE = "application/vnd.google-apps.document";
const PDF_MIME_TYPE = "application/pdf";

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}

function assertPdf(buffer) {
  if (buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("El archivo recibido no contiene un PDF válido.");
  }
  return buffer;
}

export function isWordDocumentName(name) {
  return /\.(doc|docx)$/i.test(name || "");
}

export function getWordMimeType(name) {
  return /\.docx$/i.test(name || "") ? DOCX_MIME_TYPE : DOC_MIME_TYPE;
}

export async function convertWordToPdf(drive, { buffer, name, parents, mimeType }) {
  const sourceMimeType = mimeType || getWordMimeType(name);
  if (![DOC_MIME_TYPE, DOCX_MIME_TYPE].includes(sourceMimeType)) {
    throw new Error("El documento debe ser un archivo Word .doc o .docx.");
  }
  const convertedDocument = await drive.files.create({
    requestBody: {
      name: name.replace(/\.docx$/i, ""),
      mimeType: GOOGLE_DOC_MIME_TYPE,
      parents,
    },
    media: {
      mimeType: sourceMimeType,
      body: Readable.from([buffer]),
    },
    fields: "id",
    supportsAllDrives: true,
  });

  try {
    const exported = await drive.files.export(
      { fileId: convertedDocument.data.id, mimeType: PDF_MIME_TYPE },
      { responseType: "arraybuffer" }
    );
    const pdfBuffer = toBuffer(exported.data);
    if (pdfBuffer.subarray(0, 5).toString() !== "%PDF-") {
      throw new Error("Google Drive no generó un archivo PDF válido.");
    }
    return pdfBuffer;
  } finally {
    try {
      await drive.files.delete({
        fileId: convertedDocument.data.id,
        supportsAllDrives: true,
      });
    } catch (error) {
      console.warn("No se pudo eliminar el documento temporal de conversión:", error?.message);
    }
  }
}

export async function getPublishedContractPdf(drive, { fileId, mimeType, name, parents }) {
  if (mimeType === PDF_MIME_TYPE) {
    const downloaded = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    return assertPdf(toBuffer(downloaded.data));
  }

  if (mimeType === GOOGLE_DOC_MIME_TYPE) {
    const exported = await drive.files.export(
      { fileId, mimeType: PDF_MIME_TYPE },
      { responseType: "arraybuffer" }
    );
    return assertPdf(toBuffer(exported.data));
  }

  const wordMimeType = [DOC_MIME_TYPE, DOCX_MIME_TYPE].includes(mimeType)
    ? mimeType
    : isWordDocumentName(name)
      ? getWordMimeType(name)
      : null;
  if (wordMimeType) {
    const downloaded = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    return convertWordToPdf(drive, {
      buffer: toBuffer(downloaded.data),
      name,
      parents,
      mimeType: wordMimeType,
    });
  }

  throw new Error(`El contrato publicado tiene un formato no compatible (${mimeType || "sin formato"}). Sube un PDF o un archivo Word .doc/.docx.`);
}

export async function uploadWordAsPdf(drive, { buffer, name, parents, mimeType }) {
  const pdfBuffer = await convertWordToPdf(drive, { buffer, name, parents, mimeType });
  const pdfName = name.replace(/\.(doc|docx)$/i, ".pdf");
  const created = await drive.files.create({
    requestBody: { name: pdfName, mimeType: PDF_MIME_TYPE, parents },
    media: {
      mimeType: PDF_MIME_TYPE,
      body: Readable.from([pdfBuffer]),
    },
    fields: "id, name, mimeType, webViewLink, webContentLink",
    supportsAllDrives: true,
  });
  if (created.data.mimeType !== PDF_MIME_TYPE) {
    throw new Error("Drive recibió el archivo convertido, pero no lo reconoció como PDF.");
  }
  return created;
}
