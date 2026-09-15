import { expect, test, type Page } from "@playwright/test";

import { attendanceToday, cleanupE2E, createStudents, creds, db, openWindow, restoreSettings, uniqueName } from "./support/db";

test.describe.configure({ mode: "serial" });

const mine = uniqueName("Teacher Mark");
const otherClassStudent = uniqueName("Other Class");

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.beforeAll(async () => {
  await cleanupE2E();
  await createStudents(creds.teacherClass, [mine]);
  const { data: other } = await db().from("classes").select("name").neq("name", creds.teacherClass).eq("is_active", true).limit(1).single();
  if (other) await createStudents(other.name, [otherClassStudent]);
});

test.afterAll(async () => {
  await restoreSettings();
  await cleanupE2E();
});

test("no signup, and staff areas require sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("link", { name: /sign up|register/i })).toHaveCount(0);
  const signup = await page.request.get("/signup");
  expect(signup.status()).toBe(404);
});

test("teacher sees only their class, can mark and undo while open", async ({ page }) => {
  await openWindow();
  await signIn(page, creds.teacherEmail, creds.teacherPassword);
  await page.waitForURL(/\/dashboard/);
  await expect(page.locator("header h1")).toHaveText(creds.teacherClass);

  await expect(page.getByText(mine)).toBeVisible();
  await expect(page.getByText(otherClassStudent)).toHaveCount(0);

  const row = page.locator("li").filter({ hasText: mine });
  await row.getByRole("button", { name: "Mark present" }).click();
  await expect(row.getByText(/Present ·/)).toBeVisible();
  await expect.poll(async () => (await attendanceToday(mine)).map((r) => r.source)).toEqual(["teacher"]);

  await row.getByRole("button", { name: "Undo" }).click();
  await expect(row.getByText("Absent")).toBeVisible();
  await expect.poll(async () => (await attendanceToday(mine)).length).toBe(0);

  // Not the admin area.
  await page.goto("/sundayschool");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("teacher exports Excel and PDF with the expected filenames; other classes are refused", async ({ page }) => {
  await signIn(page, creds.teacherEmail, creds.teacherPassword);
  await page.waitForURL(/\/dashboard/);
  await page.goto("/dashboard/history?from=2026-01-04&to=2026-03-29");

  const slug = creds.teacherClass.replace(/[^A-Za-z0-9]+/g, "-");
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download Excel" }).click()]);
  expect(xlsx.suggestedFilename()).toBe(`RCCG-Bethel-${slug}-2026-01-04-to-2026-03-29.xlsx`);
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF" }).click()]);
  expect(pdf.suggestedFilename()).toBe(`RCCG-Bethel-${slug}-2026-01-04-to-2026-03-29.pdf`);

  const { data: other } = await db().from("classes").select("id").neq("name", creds.teacherClass).limit(1).single();
  const refused = await page.request.get(`/api/export/xlsx?classId=${other!.id}`);
  expect(refused.status()).toBe(403);
});

test("superintendent: overview, create and deactivate a class", async ({ page }) => {
  await signIn(page, creds.adminEmail, creds.adminPassword);
  await page.waitForURL(/\/sundayschool/);
  await expect(page.getByText("Present across all classes")).toBeVisible();

  const name = uniqueName("Class");
  await page.goto("/sundayschool/classes");
  await page.getByRole("button", { name: "New class" }).click();
  await page.getByRole("dialog").getByLabel("Class name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create class" }).click();
  const row = page.locator("li").filter({ hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate class" }).click();
  await expect(row.getByText("Deactivated")).toBeVisible();

  const { data: audit } = await db().from("audit_log").select("action").eq("details->new->>name", name);
  expect(audit?.map((a) => a.action)).toEqual(expect.arrayContaining(["classes.insert", "classes.update"]));
  await db().from("classes").delete().eq("name", name);
});
