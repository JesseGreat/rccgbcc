import { expect, test } from "@playwright/test";

test("manifest and icons make the app installable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/", theme_color: "#0e0d0d" });
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? "any"}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));

  for (const icon of manifest.icons) {
    const img = await request.get(icon.src);
    expect(img.headers()["content-type"]).toContain("image/png");
  }
  expect((await request.get("/apple-icon.png")).ok()).toBe(true);

  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
});

test("offline: the installed app opens to a helpful page, not a browser error", async ({ page, context }) => {
  await page.goto("/");
  // Wait for the service worker to install and take control of the page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No connection. Please try again." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Sunday School Attendance")).toBeVisible();
});
