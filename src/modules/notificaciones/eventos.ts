// Eventos de dominio que generan avisos. Los emiten los servicios después de confirmar su
// transacción (ver emitir.ts).

export type EventoAviso =
  | { tipo: "PAGO_ACREDITADO"; socioId: string; monto: number }
  | { tipo: "CARGOS_GENERADOS"; periodo: string; socios: { socioId: string; monto: number; vencimiento: Date }[] }
  | { tipo: "CLASE_SUSPENDIDA"; actividadId: string; fecha: Date; hora: string; motivo: string }
  | {
      tipo: "CLASE_REPROGRAMADA";
      actividadId: string;
      fecha: Date;
      hora: string;
      nuevaFecha: Date;
      nuevaHora: string;
      motivo: string;
    }
  | { tipo: "CLASE_RESTABLECIDA"; actividadId: string; fecha: Date; hora: string }
  | { tipo: "ACTIVIDAD_NUEVA"; actividadId: string }
  | { tipo: "ACTIVIDAD_EDITADA"; actividadId: string }
  | { tipo: "EVENTO_NUEVO"; eventoId: string }
  | { tipo: "EVENTO_CANCELADO"; titulo: string; fecha: Date; hora: string; actividadId: string | null }
  | { tipo: "LUGAR_LIBERADO"; actividadId: string; eventoId?: undefined }
  | { tipo: "LUGAR_LIBERADO"; eventoId: string; actividadId?: undefined }
  | { tipo: "AVISO_CLUB"; asunto: string; mensaje: string; actividadId: string | null };

export type TipoAviso = EventoAviso["tipo"] | "AVISO_PLATAFORMA";
