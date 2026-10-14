// Formularios de alta/edición de actividades (recurrentes) y eventos (puntuales).
import { Boton, Campo, Selector } from "@/components/ui";
import { claveDia } from "../reglas";
import { HorariosEditor } from "./HorariosEditor";


interface ActividadForm {
  nombre: string;
  descripcion: string | null;
  cupo: number;
  precioClase: number;
  fechaInicio: Date;
  fechaFin: Date | null;
  horarios: { diaSemana: number; hora: string; duracionMin: number }[];
}

/** Actividad: los horarios semanales que tenga (renglones), vigencia, cupo y arancel. */
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
  return (
    <form action={action} className="flex flex-col gap-3">
      <Campo label="Nombre" name="nombre" defaultValue={actividad?.nombre} required />
      <Campo label="Descripción (opcional)" name="descripcion" defaultValue={actividad?.descripcion ?? ""} />
      <HorariosEditor iniciales={actividad?.horarios ?? []} />
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
        <Campo label="Cupo por clase" name="cupo" type="number" min={1} defaultValue={actividad?.cupo} required />
        <Campo label="Precio por clase ($, 0 = gratis)" name="precioClase" type="number" min={0} defaultValue={actividad?.precioClase ?? 0} />
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
            Participantes de {a.nombre}
          </option>
        ))}
      </Selector>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-slate-700">
          <input type="checkbox" name="conInscripcion" className="accent-primario-700" />
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
