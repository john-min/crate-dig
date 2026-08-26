import { expect, test } from "@playwright/test";

test("Map discovery shell", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/map?source=mock");
  await expect(page.getByPlaceholder("Search or describe a vibe…")).toBeVisible();
  await expect(page.getByText("Records in view", { exact: false })).toBeVisible();
  await expect(page).toHaveScreenshot("map-discovery-desktop.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("Map with Q open", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/map?source=mock");
  await page.getByRole("button", { name: "Ask Q" }).click();
  await expect(page.getByRole("complementary", { name: "Q assistant" })).toBeVisible();
  await expect(page).toHaveScreenshot("map-q-desktop.png", {
    animations: "disabled",
    fullPage: true,
  });
});
