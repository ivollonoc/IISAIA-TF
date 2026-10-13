// Vista "por fecha" de Actividades y eventos del socio: clases y eventos mezclados, agrupados por día.
import { claveDia } from "./reglas";

type Fechado = { fecha: Date; hora: string };
export type ItemDelDia<C, E> = { tipo: "clase"; item: C } | { tipo: "evento"; item: E };

/** Días con clases o eventos, en orden; dentro del día por hora y, a igual hora, primero las clases. */
export function agruparPorDia<C extends Fechado, E extends Fechado>(clases: C[], eventos: E[]) {
  const items: ItemDelDia<C, E>[] = [
    ...clases.map((item) => ({ tipo: "clase" as const, item })),
    ...eventos.map((item) => ({ tipo: "evento" as const, item })),
  ];
  const orden = (i: ItemDelDia<C, E>) => `${claveDia(i.item.fecha)} ${i.item.hora} ${i.tipo === "clase" ? 0 : 1}`;
  items.sort((a, b) => orden(a).localeCompare(orden(b)));

  const dias: { fecha: Date; items: ItemDelDia<C, E>[] }[] = [];
  for (const i of items) {
    const ultimo = dias.at(-1);
    if (ultimo && claveDia(ultimo.fecha) === claveDia(i.item.fecha)) ultimo.items.push(i);
    else dias.push({ fecha: i.item.fecha, items: [i] });
  }
  return dias;
}
