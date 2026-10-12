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
});
