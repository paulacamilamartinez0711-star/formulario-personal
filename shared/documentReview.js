export const DOCUMENTOS_EMPLEADO = [
  {
    clave: "cedulaFrente",
    campoUrl: "cedula_frente_url",
    etiqueta: "Cédula - frente",
    carpeta: "cedulas",
  },
  {
    clave: "cedulaRespaldo",
    campoUrl: "cedula_respaldo_url",
    etiqueta: "Cédula - respaldo",
    carpeta: "cedulas",
  },
  {
    clave: "certificadoBancario",
    campoUrl: "certificado_bancario_url",
    etiqueta: "Certificado bancario",
    carpeta: "certificados-bancarios",
  },
  {
    clave: "certificadoEPS",
    campoUrl: "certificado_eps_url",
    etiqueta: "Certificado EPS",
    carpeta: "certificados-eps",
  },
  {
    clave: "certificadoPension",
    campoUrl: "certificado_pension_url",
    etiqueta: "Certificado de pensiones",
    carpeta: "certificados-pension",
  },
  {
    clave: "fotografia",
    campoUrl: "fotografia_url",
    etiqueta: "Fotografía",
    carpeta: "fotografias",
  },
  {
    clave: "firma",
    campoUrl: "firma_url",
    etiqueta: "Firma manuscrita",
    carpeta: "firmas",
  },
];

export const obtenerDocumentosPorCorregir = (revision = {}) => (
  DOCUMENTOS_EMPLEADO
    .filter(({ clave }) => revision?.[clave]?.estado === "corregir")
);

export const limpiarRevisionesDocumentos = (revision = {}, claves = []) => {
  const actualizadas = { ...revision };
  claves.forEach((clave) => {
    delete actualizadas[clave];
  });
  return actualizadas;
};
