const apiBase = import.meta.env.VITE_API_URL || "";

function idArchivoDrive(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("id") || parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || null;
  } catch {
    return null;
  }
}

export function urlDocumentoContrato(documento, cedula, descargar = false) {
  const id = idArchivoDrive(documento?.url);
  if (!id || !cedula) return documento?.url || "";
  const base = `${apiBase}/api/archivos?accion=contrato-empleado&fileId=${encodeURIComponent(id)}&cedula=${encodeURIComponent(cedula)}`;
  return descargar ? `${base}&descargar=true` : base;
}

export function nombrePdfDocumento(documento, cedula) {
  const nombre = documento?.name || documento?.tipo || `documento_${cedula}`;
  return `${String(nombre).replace(/\.(docx?|pdf)$/i, "")}.pdf`;
}

export function verDocumentoContrato(documento, cedula) {
  window.open(urlDocumentoContrato(documento, cedula), "_blank", "noopener");
}

export async function descargarDocumentoContrato(documento, cedula) {
  try {
    const respuesta = await fetch(urlDocumentoContrato(documento, cedula, true));
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const href = URL.createObjectURL(await respuesta.blob());
    const enlace = document.createElement("a");
    enlace.href = href;
    enlace.download = nombrePdfDocumento(documento, cedula);
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (error) {
    console.error("Error descargando el documento:", error);
    alert("No se pudo descargar el documento. Intenta nuevamente.");
  }
}
