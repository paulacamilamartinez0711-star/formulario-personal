const CAMPOS_REQUERIDOS = [
  "cedula",
  "nombre_completo",
  "correo",
  "lugar_expedicion_departamento",
  "lugar_expedicion_municipio",
  "fecha_nacimiento",
  "lugar_nacimiento_departamento",
  "lugar_nacimiento_municipio",
  "celular",
  "direccion",
  "ciudad_departamento",
  "ciudad_municipio",
  "cuenta_bancaria",
  "entidad_financiera",
  "persona_contacto",
  "celular_contacto",
  "parentesco",
  "estado_civil",
  "tipo_sangre",
  "eps",
  "fondo_pension",
  "talla_botas",
  "talla_camisa",
  "talla_pantalon",
  "cedula_frente_url",
  "cedula_respaldo_url",
  "certificado_bancario_url",
  "certificado_eps_url",
  "certificado_pension_url",
  "fotografia_url",
  "firma_url",
];

export function isFormularioEmpleadoCompleto(empleado) {
  if (!empleado) return false;
  if (empleado.formulario_completo === false) return false;
  if (CAMPOS_REQUERIDOS.some((campo) => !String(empleado[campo] ?? "").trim())) {
    return false;
  }
  if (empleado.eps === "OTRA" && !String(empleado.eps_otra ?? "").trim()) {
    return false;
  }
  if (empleado.fondo_pension === "OTRA" && !String(empleado.fondo_pension_otra ?? "").trim()) {
    return false;
  }
  return true;
}

export const CAMPOS_ESTADO_FORMULARIO = CAMPOS_REQUERIDOS.join(",");
