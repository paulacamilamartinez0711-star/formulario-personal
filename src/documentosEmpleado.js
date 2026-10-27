import PizZip from "pizzip";
import { ajustarBloqueFirmas } from "../shared/contractSignatureBlock.js";
import {
  calcularAuxilioTransporteDiario,
  formatoValorContrato,
} from "../shared/contractValues.js";
import contratoUrl from "./assets/MODELO CONTRATO PERSONAL MAMONAL.docx?url";
import autorizacionCuentaUrl from "./assets/CRD-PSOL-RH-F-03 AUTORIZACION CONSIGNACION SALARIOS Y PRESTACIONES SOCIALES.docx?url";
import autorizacionPruebaUrl from "./assets/CRD-PSOL-RH-F-04 AUTORIZACION DE PRUEBA PSA.docx?url";
import autorizacionResultadosUrl from "./assets/CRD-PSOL-RH-F-05 AUTORIZACION CONOCIMIENTO RESULTADO DE PRUEBAS PSA.docx?url";
import consentimientoAfiliacionUrl from "./assets/CRD-PSOL-RH-F-06 CONSENTIMIENTO DE AFILIACION.docx?url";

const plantillas = [
  { archivo: "MODELO CONTRATO PERSONAL MAMONAL.docx", url: contratoUrl },
  { archivo: "Autorizacion de consignacion.docx", url: autorizacionCuentaUrl },
  { archivo: "Autorizacion de prueba PSA.docx", url: autorizacionPruebaUrl },
  { archivo: "Autorizacion de resultados PSA.docx", url: autorizacionResultadosUrl },
  { archivo: "Consentimiento de afiliacion.docx", url: consentimientoAfiliacionUrl, afiliacion: true },
];

export const documentosCRD = plantillas.map(({ archivo }) => archivo);

const escaparXml = (valor) => String(valor ?? "").replace(/[<>&'"]/g, (caracter) => ({
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
}[caracter]));

const decodificarXml = (valor) => String(valor || "")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");

const textoFecha = (valor) => {
  if (!valor) return "";
  const [anio, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!anio || !mes || !dia) return "";

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(anio, mes - 1, dia));
};

const valorCampo = (empleado, ...nombres) => {
  for (const nombre of nombres) {
    const valor = empleado?.[nombre];
    if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
      return valor;
    }
  }
  return "";
};

const esOtraOpcion = (valor) => ["OTRA", "OTRO", "OTRA EPS", "OTRO FONDO"].includes(
  String(valor || "").trim().toUpperCase()
);

const reordenarCiudadDireccion = (xml) => {
  const parrafos = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  const textoDeParrafo = (parrafo) => [...parrafo.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(([, texto]) => decodificarXml(texto))
    .join("")
    .trim();
  const indiceDeEtiqueta = (etiqueta) => parrafos.findIndex(([parrafo]) => (
    textoDeParrafo(parrafo) === etiqueta
  ));
  const indiceDireccion = indiceDeEtiqueta("Dirección:");
  const indiceCiudad = indiceDeEtiqueta("Ciudad:");

  if (indiceDireccion < 0 || indiceCiudad < 0) {
    throw new Error("La plantilla de afiliación no contiene los campos Ciudad y Dirección.");
  }
  if (indiceCiudad < indiceDireccion) return xml;
  if (
    indiceDireccion + 1 !== indiceCiudad - 1
    || !parrafos[indiceDireccion + 1]
    || !parrafos[indiceCiudad + 1]
  ) {
    throw new Error("No se pudo reordenar Ciudad y Dirección en la plantilla de afiliación.");
  }

  const inicioDireccion = parrafos[indiceDireccion].index;
  const finValorDireccion = parrafos[indiceDireccion + 1].index
    + parrafos[indiceDireccion + 1][0].length;
  const inicioCiudad = parrafos[indiceCiudad].index;
  const finValorCiudad = parrafos[indiceCiudad + 1].index
    + parrafos[indiceCiudad + 1][0].length;

  return [
    xml.slice(0, inicioDireccion),
    xml.slice(inicioCiudad, finValorCiudad),
    xml.slice(finValorDireccion, inicioCiudad),
    xml.slice(inicioDireccion, finValorDireccion),
    xml.slice(finValorCiudad),
  ].join("");
};

const agregarDespuesDelTexto = (parrafo, etiqueta, valor) => {
  if (!valor) return parrafo;
  const etiquetaXml = escaparXml(etiqueta);
  const coincidencias = [...parrafo.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)];
  const coincidencia = coincidencias.find(([, texto]) => texto.includes(etiquetaXml));
  if (!coincidencia) return parrafo;

  const nodo = coincidencia[0];
  const textoNodo = coincidencia[1];
  return parrafo.replace(nodo, nodo.replace(
    `>${textoNodo}</w:t>`,
    `>${textoNodo}${textoNodo.endsWith(etiquetaXml) ? " " : ""}${escaparXml(valor)} </w:t>`
  ));
};

const completarConsentimientoAfiliacion = (xml, empleado) => {
  const municipio = valorCampo(empleado, "ciudad_municipio", "ciudad");
  const ciudad = [municipio, valorCampo(empleado, "ciudad_departamento")].filter(Boolean).join(", ");
  const nombre = valorCampo(empleado, "nombre_completo", "nombre");
  const documento = valorCampo(empleado, "cedula", "documento");
  const telefono = valorCampo(empleado, "celular", "telefono");
  const epsBase = valorCampo(empleado, "eps");
  const eps = esOtraOpcion(epsBase) ? valorCampo(empleado, "eps_otra") : epsBase;
  const pensionBase = valorCampo(empleado, "fondo_pension", "pension");
  const pension = esOtraOpcion(pensionBase)
    ? valorCampo(empleado, "fondo_pension_otra")
    : pensionBase;
  const estadoCivil = valorCampo(empleado, "estado_civil");
  const tallas = {
    Camisa: valorCampo(empleado, "talla_camisa"),
    Pantalon: valorCampo(empleado, "talla_pantalon"),
    Botas: valorCampo(empleado, "talla_botas"),
  };
  const contacto = {
    PERSONA: valorCampo(empleado, "persona_contacto"),
    TELEFONO: valorCampo(empleado, "celular_contacto"),
    Telefono: valorCampo(empleado, "celular_contacto"),
    PARENTESCO: valorCampo(empleado, "parentesco"),
    ESTADO_CIVIL: estadoCivil,
  };
  const anexar = (parrafo, etiqueta, valor) => {
    if (!valor || parrafo.includes(escaparXml(valor))) return parrafo;
    return agregarDespuesDelTexto(parrafo, etiqueta, valor);
  };

  const contenido = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (original) => {
    const texto = [...original.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map(([, parte]) => parte)
      .join("");
    let parrafo = original;

    if (texto.includes("Yo") && texto.includes("C.C.") && texto.includes("Nº")) {
      parrafo = anexar(parrafo, "Yo", nombre);
      parrafo = anexar(parrafo, "Nº", documento);
    }
    if (texto.includes("De") && texto.includes("Teléfono")) {
      parrafo = anexar(parrafo, "De", ciudad);
      parrafo = anexar(parrafo, "Teléfono", telefono);
    }
    if (texto.includes("Entidad Promotora") && texto.includes("Pensiones")) {
      parrafo = anexar(parrafo, "E.P.S.", eps);
      parrafo = anexar(parrafo, "Pensiones", pension);
    }
    if (texto.includes("Dirección:") && texto.includes("Ciudad:")) {
      parrafo = anexar(parrafo, "Dirección:", valorCampo(empleado, "direccion"));
      parrafo = anexar(parrafo, "Ciudad:", ciudad);
    }
    if (texto.includes("Correo:")) {
      parrafo = anexar(parrafo, "Correo:", valorCampo(empleado, "correo", "email"));
    }
    if (texto.includes("Sangre:")) {
      parrafo = anexar(parrafo, "Sangre:", valorCampo(empleado, "tipo_sangre"));
    }
    if (texto.includes("Estado") && texto.includes("civil")) {
      const opcion = {
        Soltero: "Soltero",
        Casado: "Casado",
        "Unión libre": "Unión",
        Viudo: "Viudo",
      }[estadoCivil];
      if (opcion) parrafo = anexar(parrafo, opcion, "[X]");
    }
    if (texto.includes("Camisa:") && texto.includes("Pantalon") && texto.includes("Botas")) {
      Object.entries(tallas).forEach(([etiqueta, valor]) => {
        parrafo = anexar(parrafo, etiqueta === "Pantalon" ? "Pantalon" : `${etiqueta}:`, valor);
      });
    }
    Object.entries(contacto).forEach(([etiqueta, valor]) => {
      if (valor && texto.includes(etiqueta)) parrafo = anexar(parrafo, etiqueta, valor);
    });
    if (texto.includes("Celular:") && texto.includes("Ciudad:")) {
      parrafo = anexar(parrafo, "Celular:", telefono);
      parrafo = anexar(parrafo, "Ciudad:", ciudad);
    }

    return parrafo;
  });
  return reordenarCiudadDireccion(contenido);
};

const generarCampos = (empleado) => {
  const valorDiario = (valor) => formatoValorContrato(valor);
  const fechaIngreso = textoFecha(
    empleado.fecha_inicio_contrato || new Date().toISOString().slice(0, 10)
  );
  const fechaNacimiento = String(empleado.fecha_nacimiento || "").slice(0, 10);
  const ciudad = [
    empleado.ciudad_municipio || empleado.ciudad,
    empleado.ciudad_departamento,
  ].filter(Boolean).join(", ");

  return {
    NOMBRE_COMPLETO: valorCampo(empleado, "nombre_completo", "nombre"),
    CEDULA: valorCampo(empleado, "cedula", "documento"),
    NUMERO_CEDULA: valorCampo(empleado, "cedula", "documento"),
    CARGO: valorCampo(empleado, "cargo"),
    PROYECTO: valorCampo(empleado, "proyecto"),
    "FRENTE DE OBRA": valorCampo(empleado, "frente_obra"),
    LUGAR_DESEMPENO_LABORES: valorCampo(empleado, "lugar_desempeno_labores"),
    LUGAR_CONTRATACION: valorCampo(empleado, "lugar_contratacion"),
    OBJETO_CONTRATO: valorCampo(empleado, "objeto_contrato"),
    DIRECCION: valorCampo(empleado, "direccion"),
    LUGAR_RESIDENCIA: valorCampo(empleado, "direccion"),
    CIUDAD: valorCampo(empleado, "ciudad_municipio", "ciudad"),
    CIUDAD_COMPLETA: ciudad,
    DEPARTAMENTO: empleado.ciudad_departamento,
    CELULAR: valorCampo(empleado, "celular", "telefono"),
    TELEFONO: valorCampo(empleado, "celular", "telefono"),
    CORREO: valorCampo(empleado, "correo", "email"),
    CORREO_ELECTRONICO: valorCampo(empleado, "correo", "email"),
    EPS: esOtraOpcion(empleado.eps) ? valorCampo(empleado, "eps_otra") : empleado.eps,
    PENSION: esOtraOpcion(empleado.fondo_pension)
      ? valorCampo(empleado, "fondo_pension_otra")
      : empleado.fondo_pension,
    FONDO_PENSIONES: esOtraOpcion(empleado.fondo_pension)
      ? valorCampo(empleado, "fondo_pension_otra")
      : empleado.fondo_pension,
    FONDO_CESANTIAS: valorCampo(empleado, "fondo_cesantias", "cesantias"),
    TIPO_SANGRE: valorCampo(empleado, "tipo_sangre"),
    ESTADO_CIVIL: valorCampo(empleado, "estado_civil"),
    TALLA_CAMISA: valorCampo(empleado, "talla_camisa"),
    TALLA_PANTALON: valorCampo(empleado, "talla_pantalon"),
    TALLA_BOTAS: valorCampo(empleado, "talla_botas"),
    PERSONA_CONTACTO: valorCampo(empleado, "persona_contacto"),
    CELULAR_CONTACTO: valorCampo(empleado, "celular_contacto"),
    CONTACTO_EMERGENCIA: valorCampo(empleado, "persona_contacto"),
    TELEFONO_EMERGENCIA: valorCampo(empleado, "celular_contacto"),
    PARENTESCO: valorCampo(empleado, "parentesco"),
    LUGAR_DE_NACIMIENTO: [
      empleado.lugar_nacimiento_departamento,
      empleado.lugar_nacimiento_municipio,
    ].filter(Boolean).join(" - "),
    M__CUENTA: empleado.cuenta_bancaria,
    ENTIDAD: empleado.entidad_financiera,
    F_INGRESO: fechaIngreso,
    DIA: fechaNacimiento ? fechaNacimiento.slice(8, 10) : "",
    MES_: fechaNacimiento ? new Intl.DateTimeFormat("es-CO", {
      month: "long",
    }).format(new Date(`${fechaNacimiento}T00:00:00`)) : "",
    AÑO: fechaNacimiento ? fechaNacimiento.slice(0, 4) : "",
    SALARIO_DIARIO: valorDiario(empleado.salario_basico),
    AUXILIO_DE_TRANSPORTE_DIARIO: formatoValorContrato(
      calcularAuxilioTransporteDiario(
        empleado.salario_basico,
        empleado.fecha_inicio_contrato
      )
    ),
    SUBSIDIO_DE_ALIMENTACIÓN_DIA: valorDiario(empleado.auxilio_1),
    SUBSIDIO_DE_ALOJAMIENTO_DIA: valorDiario(empleado.auxilio_2),
    BONO_DE_PRODUCTIVIDAD_DIA: valorDiario(empleado.bono_productividad),
    BONO_MERA_LIBERALIDAD_DIA: valorDiario(empleado.bono_mera_liberalidad),
  };
};

function reemplazarValorDespuesDeEtiqueta(xml, etiqueta, valor) {
  let encontrada = false;
  const actualizado = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (parrafo) => {
    const nodosTexto = [...parrafo.matchAll(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g)];
    const textos = nodosTexto.map((nodo) => (
      decodificarXml(nodo[0].replace(/^<w:t(?:\s[^>]*)?>|<\/w:t>$/g, ""))
    ));
    const textoCompleto = textos.join("");
    const inicioEtiqueta = textoCompleto.indexOf(etiqueta);
    if (inicioEtiqueta < 0) return parrafo;
    encontrada = true;

    const finEtiqueta = inicioEtiqueta + etiqueta.length;
    let posicion = 0;
    let reemplazoInsertado = false;

    return parrafo.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, (nodo) => {
      const texto = decodificarXml(nodo.replace(/^<w:t(?:\s[^>]*)?>|<\/w:t>$/g, ""));
      const inicioNodo = posicion;
      const finNodo = inicioNodo + texto.length;
      posicion = finNodo;

      if (finNodo <= finEtiqueta) return nodo;

      const nuevoTexto = inicioNodo < finEtiqueta
        ? `${texto.slice(0, finEtiqueta - inicioNodo)}${valor ? ` ${valor}` : ""}`
        : reemplazoInsertado ? "" : valor;
      reemplazoInsertado = true;
      return nodo.replace(/>([\s\S]*)<\/w:t>$/, `>${escaparXml(nuevoTexto)}</w:t>`);
    });
  });
  if (!encontrada) {
    throw new Error(`La plantilla no contiene el campo "${etiqueta}".`);
  }
  return actualizado;
}

function agregarLineaAuxilioTransporte(xml, valor) {
  if (/AUXILIO DE TRANSPORTE DIARIO/i.test(xml)) return xml;

  let insertado = false;
  const actualizado = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (parrafo) => {
    if (insertado) return parrafo;
    const texto = decodificarXml(
      [...parrafo.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map(([, parte]) => parte)
        .join("")
    );
    if (!/SALARIO BASICO DIARIO/i.test(texto)) return parrafo;

    const propiedades = parrafo.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || "";
    const parrafoTransporte = `<w:p>${propiedades}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">AUXILIO DE TRANSPORTE DIARIO: $ ${escaparXml(valor)}</w:t></w:r></w:p>`;
    insertado = true;
    return `${parrafo}${parrafoTransporte}`;
  });
  if (!insertado) {
    throw new Error("La plantilla no contiene el renglón del salario básico diario.");
  }
  return actualizado;
}

function agregarLineaBonoMeraLiberalidad(xml, valor) {
  if (/BONO MERA LIBERALIDAD/i.test(xml)) return xml;

  let insertado = false;
  const actualizado = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (parrafo) => {
    if (insertado) return parrafo;
    const texto = decodificarXml(
      [...parrafo.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map(([, parte]) => parte)
        .join("")
    );
    if (!/BONO DE PRODUCTIVIDAD/i.test(texto)) return parrafo;

    const propiedadesParrafo = parrafo.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || "";
    const propiedadesTexto = parrafo.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] || "";
    const lineaBono = `<w:p>${propiedadesParrafo}<w:r>${propiedadesTexto}<w:t xml:space="preserve">BONO MERA LIBERALIDAD: $ ${escaparXml(valor)}</w:t></w:r></w:p>`;
    insertado = true;
    return `${parrafo}${lineaBono}`;
  });
  if (!insertado) {
    throw new Error("La plantilla no contiene el renglón del bono de productividad.");
  }
  return actualizado;
}

function completarContrato(xml, empleado, campos) {
  let contenido = reemplazarValorDespuesDeEtiqueta(
    xml,
    "LUGAR DONDE DESEMPEÑARA LAS LABORES:",
    empleado.lugar_desempeno_labores
  );
  contenido = reemplazarValorDespuesDeEtiqueta(
    contenido,
    "LUGAR DONDE HA SIDO CONTRATADO EL TRABAJADOR:",
    empleado.lugar_contratacion
  );
  contenido = agregarLineaAuxilioTransporte(
    contenido,
    campos.AUXILIO_DE_TRANSPORTE_DIARIO
  );
  if (valorCampo(empleado, "bono_mera_liberalidad") !== "") {
    contenido = agregarLineaBonoMeraLiberalidad(
      contenido,
      campos.BONO_MERA_LIBERALIDAD_DIA
    );
  }
  if (empleado.objeto_contrato) {
    const inicioPrimeraClausula = contenido.indexOf("PRIMERA");
    const inicioObjeto = contenido.indexOf("OBJETO.", inicioPrimeraClausula);
    const finObjeto = contenido.indexOf("</w:t>", inicioObjeto) + 6;
    if (inicioObjeto >= 0 && finObjeto >= 6) {
      contenido = `${contenido.slice(0, finObjeto)}<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve"> ${escaparXml(empleado.objeto_contrato)}. </w:t></w:r>${contenido.slice(finObjeto)}`;
    }
  }

  return contenido
    .replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => (
      /<w:fldChar\b|<w:instrText\b/.test(run) ? "" : run
    ));
}

const nombreSeguro = (valor) => String(valor || "empleado")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9_-]+/g, "_")
  .replace(/^_+|_+$/g, "");

async function crearDocumentoDesdePlantilla(empleado, plantilla) {
  const campos = generarCampos(empleado);
  const sufijo = `${nombreSeguro(empleado.cedula)}_${nombreSeguro(empleado.nombre_completo)}`;

  const respuesta = await fetch(plantilla.url);
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar la plantilla "${plantilla.archivo}".`);
  }
  const documentoZip = new PizZip(await respuesta.arrayBuffer());

  Object.entries(documentoZip.files).forEach(([ruta, archivo]) => {
    if (archivo.dir || !/\.(xml|rels)$/i.test(ruta)) return;
    let contenido = archivo.asText();
    if (
      plantilla.afiliacion
      && ruta === "word/document.xml"
      && !contenido.includes("«NOMBRE_COMPLETO»")
    ) {
      contenido = completarConsentimientoAfiliacion(contenido, empleado);
    }
    contenido = contenido.replace(/«([^»]+)»/g, (marcador, campo) => (
      Object.hasOwn(campos, campo) ? escaparXml(campos[campo]) : marcador
    ));
    if (plantilla.afiliacion && ruta === "word/document.xml") {
      contenido = completarConsentimientoAfiliacion(contenido, empleado);
    }
    if (plantilla.archivo === "MODELO CONTRATO PERSONAL MAMONAL.docx" && ruta === "word/document.xml") {
      contenido = completarContrato(contenido, empleado, campos);
      contenido = ajustarBloqueFirmas(contenido);
    }
    documentoZip.file(ruta, contenido);
  });

  if (plantilla.archivo === "MODELO CONTRATO PERSONAL MAMONAL.docx") {
    const configuracion = documentoZip.file("word/settings.xml");
    if (configuracion) {
      documentoZip.file(
        "word/settings.xml",
        configuracion.asText().replace(/<w:mailMerge\b[\s\S]*?<\/w:mailMerge>/g, "")
      );
    }
    const tiposContenido = documentoZip.file("[Content_Types].xml");
    if (tiposContenido) {
      documentoZip.file(
        "[Content_Types].xml",
        tiposContenido.asText().replace(/<Override PartName="\/word\/recipientData\.xml"[^>]*\/>/g, "")
      );
    }
    documentoZip.remove("word/recipientData.xml");
    documentoZip.remove("word/_rels/settings.xml.rels");
  }

  const marcadoresSinCompletar = [];
  Object.entries(documentoZip.files).forEach(([ruta, archivo]) => {
    if (archivo.dir || !/\.(xml|rels)$/i.test(ruta)) return;
    const contenido = archivo.asText();
    for (const [, marcador] of contenido.matchAll(/«([^»]+)»/g)) {
      marcadoresSinCompletar.push(marcador);
    }
  });
  if (marcadoresSinCompletar.length) {
    throw new Error(
      `La plantilla "${plantilla.archivo}" contiene campos sin asignar: ${[...new Set(marcadoresSinCompletar)].join(", ")}.`
    );
  }

  return {
    contenido: documentoZip.generate({ type: "uint8array" }),
    nombre: plantilla.archivo.replace(/\.docx$/i, `_${sufijo}.docx`),
  };
}

export async function crearDocumentoEmpleado(empleado, nombreDocumento) {
  const plantilla = plantillas.find(({ archivo }) => archivo === nombreDocumento);
  if (!plantilla) {
    throw new Error(`No existe la plantilla de documento "${nombreDocumento}".`);
  }

  const documento = await crearDocumentoDesdePlantilla(empleado, plantilla);
  return new Blob([documento.contenido], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export async function crearPaqueteDocumentosEmpleado(empleado) {
  const archivoZip = new PizZip();

  for (const plantilla of plantillas) {
    const documento = await crearDocumentoDesdePlantilla(empleado, plantilla);
    archivoZip.file(documento.nombre, documento.contenido);
  }

  return archivoZip.generate({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
  });
}
