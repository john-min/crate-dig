import { expect, test } from "@playwright/test";

test("Jeff USB library loads and streams from the local API", async ({ page }) => {
  test.skip(
    process.env.CRATE_DIG_LOCAL_SMOKE !== "1",
    "Requires Jeff's local USB library and the local API.",
  );

  await page.goto("/map");
  await expect(page.getByText("Jeff USB - 2026-08-15", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Search or describe a vibe…").fill("Dancing Stuff");
  const row = page.getByRole("row", {
    name: /Dancing Stuff .* by Massiande/i,
  });
  await expect(row).toBeVisible();
  await expect(row.getByText("122", { exact: true })).toBeVisible();
  await expect(row.getByText("7A", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: /Play Dancing Stuff/i }).click();
  await expect(row.getByRole("button", { name: /Pause Dancing Stuff/i })).toBeVisible();
});
