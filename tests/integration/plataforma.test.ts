import { beforeEach, describe, expect, it } from "vitest";
import { obtenerClubPorSlug } from "@/modules/clubs/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";


beforeEach(resetDb);

describe("obtenerClubPorSlug", () => {
  it("encuentra el club o devuelve null", async () => {
    const c = await f.crearClub({ slug: "norte" });
    expect((await obtenerClubPorSlug("norte"))?.id).toBe(c.id);
    expect(await obtenerClubPorSlug("no-existe")).toBeNull();
  });
});
