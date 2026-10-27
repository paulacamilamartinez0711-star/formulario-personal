const parrafoVacio = String.raw`<w:p\b[^>]*><w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr><\/w:p>`;

/**
 * El bloque del testigo no cabe completo en la última página cuando Google Drive convierte el
 * Word a PDF, y su línea pasaba a una página nueva. Se quita un renglón vacío previo a "TESTIGO".
 */
function compactarBloqueTestigo(xml) {
  return xml.replace(
    new RegExp(`(${parrafoVacio})(${parrafoVacio})(<w:p\\b(?:(?!<w:p\\b)[\\s\\S])*?<w:t\\b[^>]*>TESTIGO<\\/w:t>)`),
    "$1$3"
  );
}

/**
 * Oculta en blanco la etiqueta "FIRMA TRABAJADOR" (el estampado de la firma la usa como
 * referencia) y compacta el bloque del testigo para que quede en la misma página.
 */
export function ajustarBloqueFirmas(xml) {
  const conEtiquetaOculta = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (parrafo) => (
    /_{5,}/.test(parrafo) && /<w:t\b[^>]*>FIRMA<\/w:t>/.test(parrafo) && /<w:t\b[^>]*>TRABAJADOR<\/w:t>/.test(parrafo)
      ? parrafo.replace(
        /(<w:r\b[^>]*>)(<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)(<w:t\b[^>]*>)/g,
        (_run, abre, propiedades, texto) => `${abre}${propiedades.replace(/(<w:rFonts\b[^>]*\/>)/, '$1<w:color w:val="FFFFFF"/>')}${texto}`
      )
      : parrafo
  ));

  return compactarBloqueTestigo(conEtiquetaOculta)
    .replace(/(<w:pgMar\b[^>]*w:bottom=")1417(")/g, "$11000$2");
}
