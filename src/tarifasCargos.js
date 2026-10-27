import { FILAS_TARIFAS } from "./tarifasCargosDatos.js";

export const TARIFAS = FILAS_TARIFAS.map(([item, cargo, salario_basico, auxilio_1, auxilio_2, bono_productividad]) => ({
  item,
  cargo,
  salario_basico,
  auxilio_1,
  auxilio_2,
  bono_productividad,
}));

export const ITEMS_TARIFA = [...new Set(TARIFAS.map((tarifa) => tarifa.item))];

export const cargosDeItem = (item) => TARIFAS.filter((tarifa) => tarifa.item === item);

export const buscarTarifa = (item, cargo) => (
  TARIFAS.find((tarifa) => tarifa.item === item && tarifa.cargo === cargo)
);

// El ITEM no se guarda en Supabase: se deduce del cargo y el salario actuales.
export function deducirItem(cargo, salario) {
  const nombre = String(cargo || "").trim().toUpperCase();
  const coincidencias = TARIFAS.filter((tarifa) => tarifa.cargo.toUpperCase() === nombre);
  const exacta = coincidencias.find((tarifa) => Number(tarifa.salario_basico) === Number(salario));
  return (exacta || coincidencias[0])?.item || "";
}
