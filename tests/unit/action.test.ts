import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { ejecutar } from "@/lib/action";
import { DomainError } from "@/lib/errors";

describe("ejecutar", () => {
  it("usa el mensaje que devuelve la acción", async () => {
    await expect(ejecutar("/x", async () => "Se generaron 3 cargos")).rejects.toThrow(
      /^REDIRECT:\/x\?ok=Se%20generaron%203%20cargos&f=[\w-]+$/,
    );
  });

  it("sin mensaje redirige con ok=1", async () => {
    await expect(ejecutar("/x", async () => undefined)).rejects.toThrow(/^REDIRECT:\/x\?ok=1&f=[\w-]+$/);
  });

  it("un error de dominio vuelve con ?error=", async () => {
    await expect(
      ejecutar("/x", async () => {
        throw new DomainError("No hay cupo");
      }),
    ).rejects.toThrow(/^REDIRECT:\/x\?error=No%20hay%20cupo&f=[\w-]+$/);
  });

  it("si la ruta ya tiene parámetros, agrega el aviso con & y revalida solo el path", async () => {
    const { revalidatePath } = await import("next/cache");
    await expect(ejecutar("/c/demo/admin/calendario?mes=2026-10", async () => "Clase suspendida")).rejects.toThrow(
      /^REDIRECT:\/c\/demo\/admin\/calendario\?mes=2026-10&ok=Clase%20suspendida&f=[\w-]+$/,
    );
    expect(revalidatePath).toHaveBeenLastCalledWith("/c/demo/admin/calendario");
  });

  it("con rutaError, un error vuelve a esa ruta (p. ej. con la clase seleccionada) y el éxito a la normal", async () => {
    await expect(
      ejecutar("/cal?mes=2026-10", async () => { throw new DomainError("Motivo corto"); }, "/cal?mes=2026-10&clase=a:2026-10-21"),
    ).rejects.toThrow(/^REDIRECT:\/cal\?mes=2026-10&clase=a:2026-10-21&error=Motivo%20corto&f=[\w-]+$/);
    await expect(ejecutar("/cal?mes=2026-10", async () => "Listo", "/cal?mes=2026-10&clase=x")).rejects.toThrow(
      /^REDIRECT:\/cal\?mes=2026-10&ok=Listo&f=[\w-]+$/,
    );
  });

  it("en modo subdominio redirige a la URL limpia del club y revalida la ruta interna", async () => {
    vi.stubEnv("TENANT_MODE", "subdomain");
    vi.stubEnv("ROOT_DOMAIN", "clubdesocios.com.ar");
    try {
      const { revalidatePath } = await import("next/cache");
      await expect(ejecutar("/c/demo/admin/socios", async () => "Listo")).rejects.toThrow(
        /^REDIRECT:https:\/\/demo\.clubdesocios\.com\.ar\/admin\/socios\?ok=Listo&f=[\w-]+$/,
      );
      expect(revalidatePath).toHaveBeenLastCalledWith("/c/demo/admin/socios");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
