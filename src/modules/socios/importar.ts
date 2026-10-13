// Alta masiva de socios desde un CSV (nombre, apellido, dni, email, telefono, tipo). Primero se
// previsualiza (cada fila con sus errores, sin guardar) y después se importa todo o nada.
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { invitarSinFallar } from "@/modules/acceso/service";
import { parsearCsv } from "./csv";
import { socioSchema, type SocioInput } from "./schema";

const OBLIGATORIAS = ["nombre", "apellido", "dni", "tipo"];
const MAXIMO = 500;
const ETIQUETAS: Record<string, string> = { nombre: "Nombre", apellido: "Apellido" };

export interface FilaImportacion {
  linea: number; // línea del archivo (el encabezado es la 1)
  valores: Record<string, string>;
  datos: SocioInput | null;
  errores: string[];
}

/** Mensaje legible de cada problema de validación de una fila. */
function erroresDe(e: ZodError): string[] {
  return e.issues
    .filter((i) => i.path[0] !== "tipoSocioId")
    .map((i) => {
      const campo = String(i.path[0]);
      return ETIQUETAS[campo] ? `${ETIQUETAS[campo]}: ${i.message}` : i.message;
    });
}

export async function previsualizarImportacion(clubId: string, texto: string) {
  const { encabezado, filas } = parsearCsv(texto);
  const faltan = OBLIGATORIAS.filter((c) => !encabezado.includes(c));
  if (faltan.length) throw new DomainError(`Faltan columnas: ${faltan.join(", ")}`);
  if (filas.length === 0) throw new DomainError("El archivo no tiene socios");
  if (filas.length > MAXIMO) throw new DomainError(`Máximo ${MAXIMO} socios por archivo`);

  const [tipos, existentes, usuarios] = await Promise.all([
    db.tipoSocio.findMany({ where: { clubId } }),
    db.socio.findMany({ where: { clubId }, select: { dni: true } }),
    db.usuario.findMany({ select: { email: true } }),
  ]);
  const tipoPorNombre = new Map(tipos.map((t) => [t.nombre.trim().toLowerCase(), t.id]));
  const dnisClub = new Set(existentes.map((s) => s.dni));
  const emailsUsados = new Set(usuarios.map((u) => u.email));
  const dnisArchivo = new Set<string>();
  const emailsArchivo = new Set<string>();

  const resultado: FilaImportacion[] = filas.map((fila, i) => {
    const valores = Object.fromEntries(encabezado.map((col, j) => [col, fila[j] ?? ""]));
    const tipoId = tipoPorNombre.get((valores.tipo ?? "").toLowerCase());
    const errores: string[] = [];
    let datos: SocioInput | null = null;
    try {
      datos = socioSchema.parse({ ...valores, tipoSocioId: tipoId ?? "pendiente" });
    } catch (e) {
      if (!(e instanceof ZodError)) throw e;
      errores.push(...erroresDe(e));
    }
    if (!valores.tipo) errores.push("Falta el tipo");
    else if (!tipoId) errores.push(`Tipo "${valores.tipo}" no existe`);
    if (datos) {
      if (dnisArchivo.has(datos.dni)) errores.push("DNI repetido en el archivo");
      else if (dnisClub.has(datos.dni)) errores.push("Ya hay un socio con ese DNI");
      dnisArchivo.add(datos.dni);
      if (datos.email) {
        if (emailsArchivo.has(datos.email)) errores.push("Email repetido en el archivo");
        else if (emailsUsados.has(datos.email)) errores.push("Ese email ya pertenece a otro usuario");
        emailsArchivo.add(datos.email);
      }
    }
    return { linea: i + 2, valores, datos: errores.length ? null : datos, errores };
  });
  return { filas: resultado, validas: resultado.filter((f) => !f.errores.length).length };
}

/** Importa todas las filas (o ninguna si alguna tiene errores). Con `invitar`, manda las invitaciones. */
export async function importarSocios(clubId: string, texto: string, opciones: { invitar: boolean }) {
  const { filas } = await previsualizarImportacion(clubId, texto);
  if (filas.some((f) => f.errores.length)) throw new DomainError("Hay filas con errores: corregí el archivo y volvé a intentar");

  const usuariosNuevos = await db.$transaction(async (tx) => {
    const ultimo = await tx.socio.aggregate({ where: { clubId }, _max: { nroSocio: true } });
    let nro = ultimo._max.nroSocio ?? 0;
    const ids: string[] = [];
    for (const { datos } of filas) {
      const d = datos!;
      const usuario = d.email ? await tx.usuario.create({ data: { email: d.email, rol: "SOCIO", clubId } }) : null;
      if (usuario) ids.push(usuario.id);
      await tx.socio.create({ data: { ...d, clubId, usuarioId: usuario?.id ?? null, nroSocio: ++nro } });
    }
    return ids;
  });
  if (opciones.invitar) for (const id of usuariosNuevos) await invitarSinFallar(id);
  return { creados: filas.length, invitados: opciones.invitar ? usuariosNuevos.length : 0 };
}
