import { expect, test, type Page } from "@playwright/test";

import { classId, cleanupE2E, creds, openWindow, restoreSettings } from "./support/db";

// Mechanical checks of the mobile rules at 360px:
//  - nothing scrolls sideways
//  - every visible tap target is at least 48×48
//  - every text input renders at 16px or more (so iOS doesn't zoom)

test.afterAll(async () => {
  await restoreSettings();
  await cleanupE2E();
});

async function audit(page: Page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const small: string[] = [];
    let checked = 0;
    for (const el of document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button]",
    )) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden") continue;
      if (el.closest("[aria-hidden=true], .sr-only")) continue;
      checked++;
      if (r.width < 48 || r.height < 48) {
        small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    const tinyInputs = [...document.querySelectorAll<HTMLElement>("input:not([type=hidden]), select, textarea")]
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.id || el.getAttribute("name") || el.tagName);
    return { overflow, small, tinyInputs, checked };
  });
}

test("student pages meet the 360px rules", async ({ page }) => {
  await openWindow();
  const teens = await classId(creds.teacherClass);

  for (const path of ["/", `/class/${teens}`, `/class/${teens}/add`, "/login", "/offline.html"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const result = await audit(page);
    expect(result.checked, `${path}: found tap targets to check`).toBeGreaterThan(0);
    console.log(`${path}: checked ${result.checked} tap targets`);
    expect.soft(result.overflow, `${path}: horizontal overflow`).toBeLessThanOrEqual(0);
    expect.soft(result.small, `${path}: tap targets under 48px`).toEqual([]);
    expect.soft(result.tinyInputs, `${path}: inputs under 16px`).toEqual([]);
  }
});

test("staff pages don't scroll sideways at 360px", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.teacherEmail);
  await page.getByLabel("Password", { exact: true }).fill(creds.teacherPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);

  for (const path of ["/dashboard", "/dashboard/history", "/dashboard/students"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { overflow, tinyInputs } = await audit(page);
    expect.soft(overflow, `${path}: horizontal overflow`).toBeLessThanOrEqual(0);
    expect.soft(tinyInputs, `${path}: inputs under 16px`).toEqual([]);
  }
});
