
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { PDFDocument, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// Bundling the worker avoids pdf.js dynamically importing pdf.worker.mjs at runtime.
globalThis.pdfjsWorker = { WorkerMessageHandler };
import {
  getDriveFileId,
  getEmployeeContractRecord,
} from "./employeeContractAccess.js";

const PDF_MIME_TYPE = "application/pdf";
const EMPLOYER_SIGNATURE_PATH = path.join(
  process.cwd(),
  "src",
  "assets",
  "Firma ERPA.png"
);
const WITNESS_SIGNATURE_PATH = path.join(
  process.cwd(),
  "src",
  "assets",
  "Firma SGB.png"
);

function safeName(value) {
  return (
    String(value || "documento")
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "documento"
  );
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

function isContractDocument(documentName) {
  return /CONTRATO/.test(
    normalizedText(documentName)
  );
}

function getSignatureTerms(documentName) {
  const name = normalizedText(documentName);

  const workerTerms = [
    "FIRMA_TRABAJADOR",
    "FIRMA DEL TRABAJADOR",
    "FIRMA TRABAJADOR",
    "FIRMA DEL AFILIADO",
    "FIRMA DEL SOLICITANTE",
    "FIRMA DEL COLABORADOR",
    "ATENTAMENTE"
    
  ];

  const employerTerms = [
    "FIRMA_EMPLEADOR",
    "FIRMA DEL EMPLEADOR",
    "FIRMA EMPLEADOR",
    "FIRMA DEL REPRESENTANTE LEGAL",
    "FIRMA DEL CONTRATANTE",
    "ATENTAMENTE",
   
    
  ];

  if (/CONSIGNACION|CONSIGNACIÓN/.test(name)) {
    return [
      "FIRMA_TRABAJADOR",
      "FIRMA_EMPLEADOR",
      "ATENTAMENTE",
    ];
  }

  if (isContractDocument(name)) {
    return workerTerms;
  }

  return [...workerTerms, ...employerTerms];
}

function isSignatureLine(text) {
  const value = String(text || "").trim();

  return (
    /_{3,}/.test(value) ||
    /-{5,}/.test(value) ||
    /_{2,}/.test(value)
  );
}

function isExplicitSignatureMarker(text) {
  return /FIRMA[_ ](?:TRABAJADOR|EMPLEADOR)/.test(
    normalizedText(text)
  );
}

function getBounds(item) {
  return {
    x: Number(item.transform?.[4] || 0),
    y: Number(item.transform?.[5] || 0),
    width: Math.max(0, Number(item.width || 0)),
    height: Math.max(
      0,
      Number(item.height || item.transform?.[3] || 0)
    ),
  };
}

/**
 * Detecta la etiqueta y busca una línea cercana.
 *
 * Importante:
 * Si no existe una línea de texto extraíble, la función
 * devuelve la posición de la etiqueta como referencia.
 * Esa referencia debe validarse según el diseño del PDF.
 */
async function findSignatureTarget(bytes, documentName) {
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;

  const terms = getSignatureTerms(documentName);
  const isContract = isContractDocument(documentName);

  for (
    let pageNumber = pdf.numPages;
    pageNumber >= 1;
    pageNumber--
  ) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const items = content.items
      .filter(
        (item) =>
          typeof item.str === "string" &&
          item.str.trim() &&
          item.transform
      )
      .map((item) => ({
        item,
        text: normalizedText(item.str),
        ...getBounds(item),
      }));

    const labels = items
      .map((entry) => ({
        ...entry,
        term: terms.find((term) =>
          entry.text.includes(term)
        ),
      }))
      .filter((entry) => entry.term);
    for (const label of labels) {
      if (isExplicitSignatureMarker(label.text)) {
        return {
          pageIndex: pageNumber - 1,
          x: label.x,
          y: label.y,
          source: "explicit-signature-marker",
          markerX: label.x,
          markerY: label.y,
          markerWidth: label.width,
          markerHeight: Math.max(label.height, 12),
        };
      }

      // Caso 1: etiqueta y línea en el mismo elemento.
      const underscoreIndex = label.item.str.indexOf("_");

      if (
        underscoreIndex >= 0 &&
        normalizedText(
          label.item.str.slice(0, underscoreIndex)
        ).includes(label.term)
      ) {
        const fraction =
          underscoreIndex /
          Math.max(label.item.str.length, 1);

        return {
          pageIndex: pageNumber - 1,
          x: label.x + label.width * fraction,
          y: label.y,
          source: isExplicitSignatureMarker(label.text)
            ? "explicit-marker-line"
            : "same-text-line",
          markerX: label.x,
          markerY: label.y,
          markerWidth: label.width * fraction,
          markerHeight: Math.max(label.height, 12),
        };
      }

      // Caso 2: línea de firma separada.
      const candidates = items
        .filter((entry) => {
          if (!isSignatureLine(entry.item.str)) {
            return false;
          }

          const verticalDistance = entry.y - label.y;
          const sameRow = Math.abs(verticalDistance) <= 6;
          const rowBelow =
            verticalDistance < -6 &&
            verticalDistance >= (isContract ? -120 : -45);

          return sameRow || rowBelow;
        })
        .map((entry) => {
          const verticalDistance = entry.y - label.y;

          return {
            ...entry,
            sameRow: Math.abs(verticalDistance) <= 6,
            score:
              Math.abs(verticalDistance) * 3 +
              Math.abs(entry.x - label.x) * 0.05,
          };
        })
        .sort((a, b) => {
          if (a.sameRow !== b.sameRow) {
            return a.sameRow ? -1 : 1;
          }

          return a.score - b.score;
        });

      if (candidates.length) {
        const line = candidates[0];

        return {
          pageIndex: pageNumber - 1,
          x: line.x,
          y: line.y,
          source: isExplicitSignatureMarker(label.text)
            ? "explicit-marker-line"
            : "detected-line",
          markerX: label.x,
          markerY: label.y,
          markerWidth: Math.max(0, line.x - label.x),
          markerHeight: Math.max(label.height, 12),
        };
      }

      // Caso 3: no hay guiones extraíbles.
      // Utiliza la etiqueta como ancla, no como coordenada
      // definitiva de la firma.
      //
      // Para formatos distintos, el desplazamiento debe
      // ajustarse a partir del PDF real.
      return {
        pageIndex: pageNumber - 1,
        x: /CONSIGNACION|CONSIGNACIÓN/.test(normalizedText(documentName))
          ? label.x + label.width + 8
          : label.x,
        y: label.y,
        source: isExplicitSignatureMarker(label.text)
          ? "explicit-signature-marker"
          : /CONSIGNACION|CONSIGNACIÓN/.test(normalizedText(documentName))
          ? "consignation-label"
          : "label-only",
        markerX: label.x,
        markerY: label.y,
        markerWidth: label.width,
        markerHeight: Math.max(label.height, 12),
      };
    }
  }

  // Google Drive puede convertir la fila final del contrato en líneas
  // vectoriales sin texto. La firma del trabajador está en la columna
  // izquierda de la última página de este formato.
  const lastPage = await pdf.getPage(pdf.numPages);
  const lastViewport = lastPage.getViewport({ scale: 1 });
  if (isContractDocument(documentName)) {
    return {
      pageIndex: pdf.numPages - 1,
      x: lastViewport.width * 0.04,
      y: lastViewport.height * 0.14,
      source: "contract-worker-column",
    };
  }

  // Los anexos CRD comparten la línea de firma en la zona superior
  // de la última página cuando la conversión no conserva el texto.
  return {
    pageIndex: pdf.numPages - 1,
    x: lastViewport.width * 0.08,
    y: lastViewport.height * 0.82,
    source: "crd-last-page-signature-line",
  };
}

async function findNamedTextTarget(bytes, anchorText) {
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  const anchor = normalizedText(anchorText);

  for (let pageNumber = pdf.numPages; pageNumber >= 1; pageNumber--) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const textItems = content.items.filter(
      (item) => typeof item.str === "string" && item.transform
    );
    const directMatch = textItems.find((item) =>
      normalizedText(item.str).includes(anchor)
    );

    if (directMatch) {
      return {
        pageIndex: pageNumber - 1,
        ...getBounds(directMatch),
      };
    }

    const anchorCompact = anchor.replace(/\s/g, "");
    const characterItems = [];
    const pageText = textItems
      .map((item) => {
        const compactText = normalizedText(item.str).replace(/\s/g, "");
        characterItems.push(...Array(compactText.length).fill(item));
        return compactText;
      })
      .join("");
    const matchIndex = pageText.indexOf(anchorCompact);

    if (matchIndex >= 0) {
      const matchedItems = [...new Set(
        characterItems.slice(matchIndex, matchIndex + anchorCompact.length)
      )];
      const bounds = matchedItems.map(getBounds);
      const minX = Math.min(...bounds.map(({ x }) => x));
      const maxX = Math.max(...bounds.map(({ x, width }) => x + width));

      return {
        pageIndex: pageNumber - 1,
        x: minX,
        y: bounds[0].y,
        width: maxX - minX,
        height: Math.max(...bounds.map(({ height }) => height)),
      };
    }
  }

  return null;
}

function getTextSignaturePlacement(
  target,
  documentName,
  image,
  page
) {
  const isContract = isContractDocument(documentName);

  const maxWidth = isContract ? 125 : 115;
  const maxHeight = isContract ? 38 : 32;

  const scale = Math.min(
    maxWidth / image.width,
    maxHeight / image.height,
    1
  );

  const width = image.width * scale;
  const height = image.height * scale;

  const { width: pageWidth, height: pageHeight } =
    page.getSize();

  // La etiqueta puede ser el ancla si no hay línea
  // de texto extraíble. Ajusta el desplazamiento
  // después de validar el diseño del documento.
  const isLabelOnly = target.source === "label-only";
  const isConsignation = target.source === "consignation-label";
  const isContractFallback = target.source === "contract-worker-column";
  const isConsignationLine = target.source === "consignation-signature-line";
  const isExplicitMarker = target.source === "explicit-signature-marker";
  const isExplicitMarkerLine = target.source === "explicit-marker-line";

  const x = target.x;

  const y = isContractFallback || isConsignation || isConsignationLine
    || isExplicitMarker || isExplicitMarkerLine
    ? target.y + 4
    : isLabelOnly
    ? target.y + 18
    : target.y - height * 0.35;

  const placement = {
    x: Math.max(12, Math.min(x, pageWidth - width - 12)),
    y: Math.max(12, Math.min(y, pageHeight - height - 12)),
    width,
    height,
  };

  return placement;
}

function getNamedSignaturePlacement(target, image, page, maxWidth = 135) {
  const maxHeight = 38;
  const scale = Math.min(
    maxWidth / image.width,
    maxHeight / image.height,
    1
  );
  const width = image.width * scale;
  const height = image.height * scale;
  const { width: pageWidth, height: pageHeight } = page.getSize();

  return {
    x: Math.max(
      12,
      Math.min(target.x + (target.width - width) / 2, pageWidth - width - 12)
    ),
    y: Math.max(12, Math.min(target.y + 8, pageHeight - height - 12)),
    width,
    height,
  };
}

async function addEmployerAndWitnessSignatures(pdf, sourceBytes, documentName) {
  const employerTarget = await findNamedTextTarget(
    sourceBytes,
    "ERMANN RUBEN PORRAS"
  );
  const witnessTarget = await findNamedTextTarget(
    sourceBytes,
    "Sonia Guarin"
  );
  if (!employerTarget || !witnessTarget) {
    const nombreFaltante = !employerTarget ? "ERMANN RUBEN PORRAS" : "Sonia Guarin";
    throw new Error(
      `No se encontró "${nombreFaltante}" en el contrato "${documentName}".`
    );
  }
  const employerImage = await pdf.embedPng(
    await readFile(EMPLOYER_SIGNATURE_PATH)
  );
  const witnessImage = await pdf.embedPng(
    await readFile(WITNESS_SIGNATURE_PATH)
  );
  const employerPage = pdf.getPages()[employerTarget.pageIndex];
  const witnessPage = pdf.getPages()[witnessTarget.pageIndex];

  if (!employerPage || !witnessPage) {
    throw new Error(`No se encontró la página de firmas en "${documentName}".`);
  }

  employerPage.drawImage(
    employerImage,
    getNamedSignaturePlacement(employerTarget, employerImage, employerPage)
  );
  witnessPage.drawImage(
    witnessImage,
    getNamedSignaturePlacement(witnessTarget, witnessImage, witnessPage, 100)
  );
}

async function getParentFolder(drive, fileId) {
  const { data } = await drive.files.get({
    fileId,
    fields: "parents",
    supportsAllDrives: true,
  });

  return data.parents?.[0] || null;
}

async function loadSignatureImage(pdf, bytes, mimeType) {
  if (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg"
  ) {
    return pdf.embedJpg(bytes);
  }

  if (mimeType === "image/png") {
    return pdf.embedPng(bytes);
  }

  throw new Error(
    `Formato de firma no compatible: ${mimeType}. ` +
    "Usa una imagen PNG o JPEG."
  );
}

export async function signPublishedContracts({
  drive,
  cedula,
  fileIds,
}) {
  const employee = await getEmployeeContractRecord(cedula);

  if (!employee) {
    throw Object.assign(
      new Error("El empleado no existe."),
      { status: 404 }
    );
  }

  const documents = Array.isArray(employee.contrato_documentos)
    ? employee.contrato_documentos.filter(
        (item) => item?.url && item?.publicado !== false
      )
    : [];

  if (!documents.length && employee.contrato_url) {
    documents.push({
      name:
        employee.contrato_nombre ||
        `contrato_${cedula}.pdf`,
      url: employee.contrato_url,
    });
  }

  const selected =
    Array.isArray(fileIds) && fileIds.length
      ? documents.filter((item) =>
          fileIds.includes(getDriveFileId(item.url))
        )
      : documents;

  if (
    !selected.length ||
    selected.length !== documents.length
  ) {
    throw Object.assign(
      new Error(
        "Debes aceptar todos los documentos publicados."
      ),
      { status: 400 }
    );
  }

  const signatureId = getDriveFileId(employee.firma_url);

  if (!signatureId) {
    throw Object.assign(
      new Error(
        "El empleado no tiene una firma válida guardada."
      ),
      { status: 400 }
    );
  }

  const signatureResponse = await drive.files.get(
    {
      fileId: signatureId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "arraybuffer",
    }
  );

  const signatureMeta = await drive.files.get({
    fileId: signatureId,
    fields: "mimeType",
    supportsAllDrives: true,
  });

  const signatureBytes = Buffer.from(signatureResponse.data);
  const signatureMimeType = signatureMeta.data.mimeType;
  const uploaded = [];

  for (const document of selected) {
    const sourceId = getDriveFileId(document.url);

    if (!sourceId) {
      throw new Error(
        `No se pudo identificar el archivo original: ${
          document.name || "documento sin nombre"
        }.`
      );
    }

    const source = await drive.files.get(
      {
        fileId: sourceId,
        alt: "media",
        supportsAllDrives: true,
      },
      {
        responseType: "arraybuffer",
      }
    );

    const sourceBytes = Buffer.from(source.data);
    const pdf = await PDFDocument.load(sourceBytes);

    const image = await loadSignatureImage(
      pdf,
      signatureBytes,
      signatureMimeType
    );

    const isContract = isContractDocument(document.name || "");
    const target = await findSignatureTarget(
      sourceBytes,
      document.name || ""
    );

    if (!target) {
      throw new Error(
        `No se encontró ninguna etiqueta de firma en "${
          document.name || "documento sin nombre"
        }".`
      );
    }

    console.info("Ubicación detectada para la firma:", {
      document: document.name,
      pageIndex: target.pageIndex,
      x: target.x,
      y: target.y,
      source: target.source,
    });

    const page = pdf.getPages()[target.pageIndex];

    if (!page) {
      throw new Error(
        `No se encontró la página de firma en "${
          document.name || "documento sin nombre"
        }".`
      );
    }

    const placement = getTextSignaturePlacement(
      target,
      document.name || "",
      image,
      page
    );

    if (
      (target.source === "explicit-signature-marker"
        || target.source === "explicit-marker-line")
      && target.markerWidth > 0
    ) {
      page.drawRectangle({
        x: Math.max(0, target.markerX - 2),
        y: Math.max(0, target.markerY - target.markerHeight * 0.25),
        width: target.markerWidth + 4,
        height: target.markerHeight * 1.5,
        color: rgb(1, 1, 1),
      });
    }

    page.drawImage(image, placement);

    if (isContract) {
      await addEmployerAndWitnessSignatures(
        pdf,
        sourceBytes,
        document.name || ""
      );
    }

    const bytes = await pdf.save();
    const fileName =
      `${safeName(document.name)}_firmado.pdf`;

    const parentFolder = await getParentFolder(
      drive,
      sourceId
    );

    const created = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: PDF_MIME_TYPE,
        ...(parentFolder ? { parents: [parentFolder] } : {}),
      },
      media: {
        mimeType: PDF_MIME_TYPE,
        body: Readable.from([Buffer.from(bytes)]),
      },
      fields: "id,name",
      supportsAllDrives: true,
    });

    try {
      await drive.permissions.create({
        fileId: created.data.id,
        requestBody: {
          type: "anyone",
          role: "reader",
        },
        supportsAllDrives: true,
      });
    } catch (error) {
      console.warn(
        "No se pudo publicar el PDF firmado:",
        error?.message
      );
    }

    uploaded.push({
      ...document,
      name: fileName,
      url:
        `https://drive.google.com/uc?export=download&id=` +
        created.data.id,
      fileId: created.data.id,
    });
  }

  const signedAt = new Date().toISOString();

  const { supabase } = await import("../src/supabase.js");

  const { error } = await supabase
    .from("empleados")
    .update({
      contrato_documentos_firmados: uploaded,
      contrato_firmado_url: uploaded[0]?.url || null,
      contrato_firmado_at: signedAt,
      contrato_aceptado: true,
      contrato_aceptado_at: signedAt,
      contrato_estado: "firmado",
    })
    .eq("id", employee.id);

  if (error) {
    throw error;
  }

  return {
    signedAt,
    documents: uploaded,
  };
}
