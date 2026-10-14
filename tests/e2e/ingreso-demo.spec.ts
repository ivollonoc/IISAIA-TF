import { expect, test } from "@playwright/test";

// Ingreso con los botones demo del home (requiere DEMO_LOGIN=true y la base con el seed):
// cada rol termina en su área.
const ROLES = [
  { boton: "Admin general", destino: /\/admin$/ },
  { boton: "Admin del club", destino: /\/c\/demo\/admin$/ },
  { boton: "Socio", destino: /\/c\/demo\/socio$/ },
];

test("el home muestra el ingreso por email", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gestión de socios para tu club" })).toBeVisible();
  await expect(page.getByLabel("Tu email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recibir link para entrar" })).toBeVisible();
});

for (const { boton, destino } of ROLES) {
  test(`entra como ${boton} y llega a su área`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: boton, exact: true }).click();
    await expect(page).toHaveURL(destino);
  });
}

test("sin sesión, el área del club vuelve al home", async ({ page }) => {
  await page.goto("/c/demo/admin");
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
  await expect(page.getByLabel("Tu email")).toBeVisible();
});
