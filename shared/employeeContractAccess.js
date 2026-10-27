import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "../src/supabase.js";

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export function getDriveFileId(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["drive.google.com", "docs.google.com"].includes(url.hostname)) return null;
    const id = url.searchParams.get("id") || url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
    return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

// Pueden existir registros duplicados por cédula; se prefiere el que tiene contrato publicado.
function pickEmployeeRecord(rows) {
  const hasContract = (row) => Number(
    Boolean(row?.contrato_url || row?.contrato_firmado_url)
    || (Array.isArray(row?.contrato_documentos) && row.contrato_documentos.length > 0)
    || (Array.isArray(row?.contrato_documentos_firmados) && row.contrato_documentos_firmados.length > 0)
  );
  return [...(rows || [])].sort((a, b) => hasContract(b) - hasContract(a))[0] || null;
}

export async function getPublishedContractForEmployee(cedula, requestedFileId) {
  if (!cedula || !/^[a-zA-Z0-9_-]+$/.test(cedula)) {
    return { error: "La cédula no es válida.", status: 400 };
  }
  if (!requestedFileId || !/^[a-zA-Z0-9_-]+$/.test(requestedFileId)) {
    return { error: "El documento solicitado no es válido.", status: 400 };
  }

  const { data: rows, error } = await supabase
    .from("empleados")
    .select("contrato_url, contrato_nombre, contrato_firmado_url, contrato_estado, contrato_documentos, contrato_documentos_firmados")
    .eq("cedula", cedula)
    .limit(20);

  if (error) {
    console.error("No se pudo validar el contrato publicado del empleado:", error);
    return { error: "No se pudo validar el documento publicado.", status: 500 };
  }
  const data = pickEmployeeRecord(rows);

  const documentos = Array.isArray(data?.contrato_documentos) ? data.contrato_documentos : [];
  const firmados = Array.isArray(data?.contrato_documentos_firmados) ? data.contrato_documentos_firmados : [];
  const documento = [...firmados, ...documentos].find((item) => getDriveFileId(item.url) === requestedFileId);
  const publishedUrl = data?.contrato_estado === "firmado"
    ? data.contrato_url || data.contrato_firmado_url
    : data?.contrato_url;
  if (!data || (
    getDriveFileId(publishedUrl) !== requestedFileId
    && !documento
    && getDriveFileId(data.contrato_firmado_url) !== requestedFileId
  )) {
    return { error: "El contrato no está publicado para este empleado.", status: 404 };
  }

  return {
    fileId: requestedFileId,
    fileName: documento?.name || data.contrato_nombre || `contrato_${cedula}.pdf`,
  };
}

export async function getEmployeeContractRecord(cedula) {
  if (!cedula || !/^[a-zA-Z0-9_-]+$/.test(cedula)) return null;
  const { data, error } = await supabase
    .from("empleados")
    .select("id, cedula, nombre_completo, firma_url, contrato_url, contrato_nombre, contrato_estado, contrato_documentos")
    .eq("cedula", cedula)
    .limit(20);
  if (error) throw error;
  return pickEmployeeRecord(data);
}
