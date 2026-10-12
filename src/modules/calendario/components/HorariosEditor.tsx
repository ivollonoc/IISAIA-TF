"use client";

// Renglones de horarios de una actividad: día, hora y duración. Se agregan los que haya (un día
// puede repetirse con otra hora: lunes 9:00 y lunes 17:00). Cada renglón viaja como h_N_dia,
// h_N_hora y h_N_dur (ver horariosDeFormulario).
import { useState } from "react";

const DIAS = [
  { valor: 1, nombre: "Lunes" },
  { valor: 2, nombre: "Martes" },
  { valor: 3, nombre: "Miércoles" },
  { valor: 4, nombre: "Jueves" },
  { valor: 5, nombre: "Viernes" },
  { valor: 6, nombre: "Sábado" },
  { valor: 0, nombre: "Domingo" },
];

type Renglon = { clave: number; dia: number; hora: string; dur: number };

export function HorariosEditor({ iniciales }: { iniciales: { diaSemana: number; hora: string; duracionMin: number }[] }) {
  const [renglones, setRenglones] = useState<Renglon[]>(() =>
    iniciales.length
      ? iniciales.map((h, i) => ({ clave: i, dia: h.diaSemana, hora: h.hora, dur: h.duracionMin }))
      : [{ clave: 0, dia: 1, hora: "19:00", dur: 60 }],
  );
  const proxima = Math.max(-1, ...renglones.map((r) => r.clave)) + 1;
  const ultimo = renglones.at(-1);

  return (
    <fieldset className="flex flex-col gap-1.5 text-sm">
      <legend className="mb-1 font-medium text-slate-700">Días y horarios</legend>
      <div className="grid grid-cols-[1fr_6rem_4.5rem_2rem] gap-2 text-xs text-slate-500">
        <span>Día</span>
        <span>Hora</span>
        <span>Minutos</span>
        <span />
      </div>
      {renglones.map((r) => (
        <div key={r.clave} className="grid grid-cols-[1fr_6rem_4.5rem_2rem] items-center gap-2">
          <select
            name={`h_${r.clave}_dia`}
            defaultValue={r.dia}
            aria-label="Día"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1"
          >
            {DIAS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.nombre}
              </option>
            ))}
          </select>
          <input
            type="time"
            name={`h_${r.clave}_hora`}
            defaultValue={r.hora}
            required
            aria-label="Hora de inicio"
            className="rounded-lg border border-slate-300 px-2 py-1"
          />
          <input
            type="number"
            name={`h_${r.clave}_dur`}
            min={15}
            max={600}
            defaultValue={r.dur}
            aria-label="Duración en minutos"
            className="rounded-lg border border-slate-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={() => setRenglones(renglones.filter((x) => x.clave !== r.clave))}
            disabled={renglones.length === 1}
            aria-label="Quitar horario"
            title="Quitar horario"
            className="rounded-lg px-1 text-lg leading-none text-slate-400 hover:text-red-700 disabled:invisible"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setRenglones([...renglones, { clave: proxima, dia: ultimo?.dia ?? 1, hora: ultimo?.hora ?? "19:00", dur: ultimo?.dur ?? 60 }])
        }
        className="mt-1 self-start text-sm font-medium text-emerald-700 hover:underline"
      >
        + Agregar horario
      </button>
    </fieldset>
  );
}
