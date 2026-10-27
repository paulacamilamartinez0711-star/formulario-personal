const VALORES_LABORALES_COLOMBIA = {
  2025: {
    salarioMinimoMensual: 1_423_500,
    auxilioTransporteMensual: 200_000,
  },
  2026: {
    salarioMinimoMensual: 1_750_905,
    auxilioTransporteMensual: 249_095,
  },
};

export function formatoValorContrato(valor) {
  return Math.round(Number(valor) || 0).toLocaleString("es-CO");
}

export function calcularAuxilioTransporteDiario(salarioDiario, fechaInicioContrato) {
  const anioContrato = Number(String(fechaInicioContrato || "").slice(0, 4))
    || new Date().getFullYear();
  const valores = VALORES_LABORALES_COLOMBIA[anioContrato];
  if (!valores) {
    throw new Error(
      `No hay valores legales configurados para calcular el auxilio de transporte de ${anioContrato}.`
    );
  }

  const salarioMensual = Number(salarioDiario || 0) * 30;
  return salarioMensual <= valores.salarioMinimoMensual * 2
    ? Math.round(valores.auxilioTransporteMensual / 30)
    : 0;
}
