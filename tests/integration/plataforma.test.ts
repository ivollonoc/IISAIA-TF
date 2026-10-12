import { beforeEach, describe, expect, it } from "vitest";
import { obtenerClubPorSlug } from "@/modules/clubs/service";
import { resumenPlataforma } from "@/modules/cuenta-corriente/consultas.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const hoy = new Date(2026, 9, 15, 12);
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

beforeEach(resetDb);

describe("resumenPlataforma", () => {
  it("consolida lo cobrado en el mes y la deuda vencida por club y en total", async () => {
    const a = await f.crearClub();
    const b = await f.crearClub();
    const sa = await f.crearSocio(a.id);
    const sb = await f.crearSocio(b.id);
    const baja = await f.crearSocio(b.id, { activo: false });
    await f.crearPagoDirecto(a.id, sa.id, { monto: 15000, fecha: new Date(2026, 9, 5) });
    await f.crearPagoDirecto(a.id, sa.id, { monto: 500, fecha: new Date(2026, 8, 5) }); // mes anterior
    await f.crearPagoDirecto(b.id, sb.id, { monto: 8000, fecha: new Date(2026, 9, 6) });
    await f.crearCargo(b.id, sb.id, { monto: 3000, vencimiento: utc(2026, 9, 10) });
    await f.crearCargo(b.id, baja.id, { monto: 2000, vencimiento: utc(2026, 9, 10) });
    await f.crearCargo(a.id, sa.id, { monto: 9000, vencimiento: utc(2026, 10, 20) }); // no vencido

    expect(await resumenPlataforma(hoy)).toEqual({
      periodo: "2026-10",
      cobradoMes: 23000,
      deudaVencida: 5000,
      sociosMorosos: 1,
      porClub: {
        [a.id]: { cobradoMes: 15000, deudaVencida: 0 },
        [b.id]: { cobradoMes: 8000, deudaVencida: 5000 },
      },
    });
  });
});

describe("obtenerClubPorSlug", () => {
  it("encuentra el club o devuelve null", async () => {
    const c = await f.crearClub({ slug: "norte" });
    expect((await obtenerClubPorSlug("norte"))?.id).toBe(c.id);
    expect(await obtenerClubPorSlug("no-existe")).toBeNull();
  });
});
