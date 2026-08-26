import { expect, test } from "@playwright/test";

test("Similarity Lab comparison workspace", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/similarity-lab?source=sample");
  await expect(page.getByRole("heading", { name: "Similarity Lab" })).toBeVisible();
  await expect(page.getByText("Sample data", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("similarity-lab-desktop.png", {
    animations: "disabled",
    fullPage: true,
  });
});
