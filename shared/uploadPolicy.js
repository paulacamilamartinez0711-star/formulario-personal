const publicFormUploadTypes = {
  cedulas: new Set(["application/pdf", "image/jpeg", "image/png"]),
  "certificados-bancarios": new Set(["application/pdf", "image/jpeg", "image/png"]),
  "certificados-eps": new Set(["application/pdf", "image/jpeg", "image/png"]),
  "certificados-pension": new Set(["application/pdf", "image/jpeg", "image/png"]),
  fotografias: new Set(["image/jpeg", "image/png"]),
  firmas: new Set(["image/jpeg", "image/png"]),
};

const maxPublicFormUploadBytes = 5 * 1024 * 1024;

export function isPublicFormUploadFolder(folder) {
  return Object.hasOwn(publicFormUploadTypes, folder);
}

export function validatePublicFormUpload(folder, file) {
  if (!isPublicFormUploadFolder(folder)) {
    return "La carpeta no está habilitada para el formulario público.";
  }
  if (file.buffer.length > maxPublicFormUploadBytes) {
    return "El archivo supera el tamaño máximo permitido de 5 MB.";
  }
  if (!publicFormUploadTypes[folder].has(file.mimeType)) {
    return "El tipo de archivo no está permitido para esta carpeta.";
  }
  return null;
}
