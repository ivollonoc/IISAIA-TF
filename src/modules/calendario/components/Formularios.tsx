// Formularios de alta/edición de actividades (recurrentes) y eventos (puntuales).
import { Boton, Campo, Selector } from "@/components/ui";
import { claveDia } from "../reglas";

const DIAS_FORM = [1, 2, 3, 4, 5, 6, 0]; // lunes a domingo
const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

interface ActividadForm {
  nombre: string;
  descripcion: string | null;
  cupo: number;
  arancel: number;
  fechaInicio: Date;
  fechaFin: Date | null;
  horarios: { diaSemana: number; hora: string; duracionMin: number }[];
}

/** Actividad: un renglón por día (marcar el día y poner hora y duración), vigencia, cupo y arancel. */
export function FormActividad({
  action,
  actividad,
  hoy,
  boton,
}: {
  action: (formData: FormData) => Promise<void>;
  actividad?: ActividadForm;
  hoy: Date;
  boton: string;
}) {
  const porDia = new Map(actividad?.horarios.map((h) => [h.diaSemana, h]));
  return (
    <form action={action} className="flex flex-col gap-3">
      <Campo label="Nombre" name="nombre" defaultValue={actividad?.nombre} required />
      <Campo label="Descripción (opcional)" name="descripcion" defaultValue={actividad?.descripcion ?? ""} />
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1 font-medium text-slate-700">Días y horarios</legend>
        {DIAS_FORM.map((d) => {
          const h = porDia.get(d);
          return (
            <div key={d} className="grid grid-cols-[6.5rem_1fr_5rem] items-center gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name={`dia_${d}`} defaultChecked={Boolean(h)} className="accent-emerald-700" />
                {NOMBRE_DIA[d]}
              </label>
              <input
                type="time"
                name={`hora_${d}`}
                defaultValue={h?.hora ?? "19:00"}
                aria-label={`Hora del ${NOMBRE_DIA[d].toLowerCase()}`}
                className="rounded-lg border border-slate-300 px-2 py-1"
              />
              <input
                type="number"
                name={`duracion_${d}`}
                min={15}
                max={600}
                defaultValue={h?.duracionMin ?? 60}
                aria-label={`Duración del ${NOMBRE_DIA[d].toLowerCase()} en minutos`}
                title="Duración (min)"
                className="rounded-lg border border-slate-300 px-2 py-1"
              />
            </div>
          );
        })}
        <p className="text-xs text-slate-500">Hora de inicio y duración en minutos de cada día marcado.</p>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          label="Desde"
          name="fechaInicio"
          type="date"
          defaultValue={claveDia(actividad?.fechaInicio ?? hoy)}
          required
        />
        <Campo
          label="Hasta (opcional)"
          name="fechaFin"
          type="date"
          defaultValue={actividad?.fechaFin ? claveDia(actividad.fechaFin) : ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Cupo" name="cupo" type="number" min={1} defaultValue={actividad?.cupo} required />
        <Campo label="Arancel mensual ($)" name="arancel" type="number" min={0} defaultValue={actividad?.arancel ?? 0} />
      </div>
      <Boton type="submit">{boton}</Boton>
    </form>
  );
}

/** Evento puntual: fecha y hora, destinatarios e inscripción opcional con cupo y precio. */
export function FormEvento({
  action,
  actividades,
  hoy,
}: {
  action: (formData: FormData) => Promise<void>;
  actividades: { id: string; nombre: string }[];
  hoy: Date;
}) {
  return (
    <form action={action} className="flex flex-col gap-3">
      <Campo label="Título" name="titulo" placeholder="Cena anual" required />
      <div className="grid grid-cols-3 gap-3">
        <Campo label="Fecha" name="fecha" type="date" min={claveDia(hoy)} required />
        <Campo label="Hora" name="hora" type="time" required />
        <Campo label="Duración (min)" name="duracionMin" type="number" min={15} max={600} defaultValue={60} />
      </div>
      <Campo label="Lugar (opcional)" name="lugar" />
      <Campo label="Descripción (opcional)" name="descripcion" />
      <Selector label="Para" name="actividadId" defaultValue="">
        <option value="">Todo el club</option>
        {actividades.map((a) => (
          <option key={a.id} value={a.id}>
            Inscriptos de {a.nombre}
          </option>
        ))}
      </Selector>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-slate-700">
          <input type="checkbox" name="conInscripcion" className="accent-emerald-700" />
          Permite inscripción
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Cupo (vacío = sin límite)" name="cupo" type="number" min={1} />
          <Campo label="Precio ($, 0 = gratis)" name="precio" type="number" min={0} defaultValue={0} />
        </div>
        <p className="text-xs text-slate-500">El cupo y el precio solo aplican si el evento permite inscripción.</p>
      </fieldset>
      <Boton type="submit">Crear evento</Boton>
    </form>
  );
}
