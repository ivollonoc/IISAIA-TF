"use client";

// Importación de socios desde CSV en dos pasos: vista previa (cada fila con sus errores) y
// confirmación (todo o nada).
import Link from "next/link";
import { useActionState } from "react";
import { Boton, Tabla } from "@/components/ui";
import { importarSociosAction, type EstadoImportacion } from "../actions";
import { urlClub } from "@/lib/tenant";

const COLUMNAS = ["nombre", "apellido", "dni", "email", "telefono", "tipo"];

export function ImportarSocios({ slug }: { slug: string }) {
  const [estado, enviar, enviando] = useActionState<EstadoImportacion, FormData>(importarSociosAction.bind(null, slug), {});

  if (estado.ok) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-emerald-800">{estado.ok}</p>
        <Link href={urlClub(slug, "/admin/socios")} className="text-emerald-700 underline">
          Ver socios
        </Link>
      </div>
    );
  }

  const conErrores = estado.filas?.filter((f) => f.errores.length).length ?? 0;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <form action={enviar} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="modo" value="previsualizar" />
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">Archivo CSV</span>
          <input type="file" name="archivo" accept=".csv,text/csv" required className="text-sm" />
        </label>
        <Boton type="submit" variante="secundario" disabled={enviando}>
          {enviando ? "Leyendo…" : "Ver vista previa"}
        </Boton>
      </form>
      {estado.error && <p className="rounded-lg bg-red-50 px-4 py-2 text-red-700">{estado.error}</p>}

      {estado.filas && (
        <>
          <p className={conErrores ? "text-red-700" : "text-emerald-800"}>
            {estado.validas} de {estado.filas.length} filas listas para importar
            {conErrores > 0 && ` · ${conErrores} con errores: corregí el archivo y volvé a cargarlo`}
          </p>
          <Tabla headers={["Línea", ...COLUMNAS, "Estado"]}>
            {estado.filas.map((f) => (
              <tr key={f.linea} className={f.errores.length ? "bg-red-50/60" : ""}>
                <td className="py-1.5 pr-3 text-slate-400">{f.linea}</td>
                {COLUMNAS.map((c) => (
                  <td key={c} className="py-1.5 pr-3">
                    {f.valores[c] || <span className="text-slate-300">—</span>}
                  </td>
                ))}
                <td className="py-1.5 pr-3">
                  {f.errores.length ? <span className="text-red-700">{f.errores.join(" · ")}</span> : <span className="text-emerald-700">OK</span>}
                </td>
              </tr>
            ))}
          </Tabla>
          {conErrores === 0 && (
            <form action={enviar} className="flex flex-wrap items-center gap-4">
              <input type="hidden" name="modo" value="importar" />
              <input type="hidden" name="texto" value={estado.texto} />
              <label className="flex items-center gap-2">
                <input type="checkbox" name="invitar" defaultChecked className="accent-emerald-700" />
                Mandar la invitación por mail a los que tienen email
              </label>
              <Boton type="submit" disabled={enviando}>
                {enviando ? "Importando…" : `Importar ${estado.validas} socios`}
              </Boton>
            </form>
          )}
        </>
      )}
    </div>
  );
}
