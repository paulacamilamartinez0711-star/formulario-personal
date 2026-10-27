export function sanitizeDriveName(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

export function getEmployeeDriveFolderName(cedula, nombreCompleto) {
  const safeName = sanitizeDriveName(nombreCompleto);
  return safeName ? `${cedula}_${safeName}` : cedula;
}

const documentNames = {
  cedulaFrente: "cedula-frente",
  cedula_frente_url: "cedula-frente",
  cedulaRespaldo: "cedula-respaldo",
  cedula_respaldo_url: "cedula-respaldo",
  cedulas: "cedula",
  certificadoBancario: "certificado-bancario",
  certificado_bancario_url: "certificado-bancario",
  "certificados-bancarios": "certificado-bancario",
  certificadoEPS: "certificado-eps",
  certificado_eps_url: "certificado-eps",
  "certificados-eps": "certificado-eps",
  certificadoPension: "certificado-pension",
  certificado_pension_url: "certificado-pension",
  "certificados-pension": "certificado-pension",
  fotografia: "fotografia",
  fotografia_url: "fotografia",
  fotografias: "fotografia",
  firma: "firma",
  firma_url: "firma",
  firmas: "firma",
  contrato: "contrato",
  contrato_url: "contrato",
  contratos: "contrato",
  contrato_firmado_url: "contrato-firmado",
  "contratos-firmados": "contrato-firmado",
};

function getFileExtension(originalName, mimeType) {
  const extensionByMimeType = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  }[mimeType];
  if (extensionByMimeType) return extensionByMimeType;

  return String(originalName || "").match(/(\.[^.]+)$/)?.[1]?.toLowerCase() || "";
}

function getDocumentLabel(documentName, fallback) {
  const mappedName = documentNames[documentName];
  const label = mappedName
    || sanitizeDriveName(documentName).replace(/\.[^.]+$/, "")
    || fallback;
  return label.replace(/\s+/g, "-");
}

export function getDriveUploadFileName({
  cedula,
  nombreCompleto,
  carpeta,
  documento,
  originalName,
  mimeType,
}) {
  const originalLabel = sanitizeDriveName(originalName).replace(/\.[^.]+$/, "");
  const documentLabel = getDocumentLabel(
    documento,
    documentNames[carpeta] || originalLabel || "documento"
  );
  const extension = getFileExtension(originalName, mimeType);
  const employeeName = sanitizeDriveName(nombreCompleto);

  return `${cedula}${employeeName ? `_${employeeName}` : ""}_${documentLabel}${extension}`;
}

export function getEmployeeDriveDocumentName({
  cedula,
  nombreCompleto,
  field,
  originalName,
  mimeType,
}) {
  const documentLabel = getDocumentLabel(field, "documento");
  const extension = getFileExtension(originalName, mimeType);
  const employeeName = sanitizeDriveName(nombreCompleto);

  return `${cedula}${employeeName ? `_${employeeName}` : ""}_${documentLabel}${extension}`;
}
