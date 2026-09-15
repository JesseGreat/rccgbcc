import { expect, test } from "@playwright/test";

import {
  attendanceToday,
  classId,
  cleanupE2E,
  closeWindow,
  createStudents,
  creds,
  openWindow,
  restoreSettings,
  setDeviceCap,
  uniqueName,
} from "./support/db";

test.describe.configure({ mode: "serial" });

let teensId: string;
const kid = uniqueName("Kid");
const sibling = uniqueName("Sibling");

test.beforeAll(async () => {
  await cleanupE2E();
  teensId = await classId(creds.teacherClass);
  await createStudents(creds.teacherClass, [kid, sibling]);
});

test.afterAll(async () => {
  await restoreSettings();
  await cleanupE2E();
});

test("closed window: classes are disabled and explained, no dead ends", async ({ page }) => {
  await closeWindow();
  await page.goto("/");
  await expect(page.getByText(/Closed/).first()).toBeVisible();
  await expect(page.getByText(/Attendance is open on/)).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(creds.teacherClass) })).toHaveCount(0);

  await page.goto(`/class/${teensId}`);
  await expect(page.getByRole("link", { name: "All classes" })).toBeVisible();
  await expect(page.getByLabel("Start typing your name")).toHaveCount(0);
});

test("search → confirm → success → back to start, then one-tap welcome back", async ({ page }) => {
  await openWindow();
  await page.goto("/");
  await expect(page.getByText(/Open, closes in/)).toBeVisible();

  await page.getByRole("link", { name: new RegExp(creds.teacherClass) }).click();
  const search = page.getByLabel("Start typing your name");
  await expect(search).toBeFocused();
  await search.pressSequentially(kid.split(" ").slice(1).join(" "), { delay: 20 });

  await page.getByRole("button", { name: new RegExp(kid) }).click();
  await expect(page.getByRole("dialog")).toContainText(`Mark ${kid} present?`);
  await page.getByRole("button", { name: "Yes, mark me present" }).click();

  await expect(page.getByText("You're all set 🎉")).toBeVisible();
  await expect(page.getByText(/Marked present at/)).toBeVisible();
  await page.waitForURL("/", { timeout: 10_000 });

  expect(await attendanceToday(kid)).toEqual([expect.objectContaining({ source: "self" })]);

  await expect(page.getByRole("region", { name: "Welcome back" })).toContainText(kid);
  // This phone just marked them, so the card celebrates instead of offering to mark again.
  await expect(page.getByRole("region", { name: "Welcome back" })).toContainText("You're in class today!");
  await expect(page.getByRole("button", { name: "Mark me present" })).toHaveCount(0);
  expect(await attendanceToday(kid)).toHaveLength(1);
});

test("device cap: a calm explanation, and nothing is written", async ({ page }) => {
  await openWindow();
  await setDeviceCap(1);
  // Each test gets a fresh browser (a new "phone"), so first use up its one mark.
  const first = uniqueName("Cap First");
  const second = uniqueName("Cap Second");
  await createStudents(creds.teacherClass, [first, second]);

  const markVia = async (name: string) => {
    await page.goto(`/class/${teensId}`);
    await page.getByLabel("Start typing your name").pressSequentially(name.split(" ").slice(1).join(" "), { delay: 20 });
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Yes, mark me present" }).click();
  };

  await markVia(first);
  await expect(page.getByText("You're all set 🎉")).toBeVisible();

  await markVia(second);
  await expect(page.getByText("This phone has already marked 1 person today.")).toBeVisible();
  await expect(page.getByText("Please ask your teacher to mark you in.")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(second);
  expect(await attendanceToday(second)).toHaveLength(0);
});

test("add yourself: possible duplicate prompt, then add as new and marked present", async ({ browser }) => {
  await openWindow();
  await setDeviceCap(4);
  const page = await (await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })).newPage();

  const typo = kid.slice(0, -1); // one letter off an existing name
  await page.goto(`/class/${teensId}/add?name=${encodeURIComponent(typo)}`);
  await page.getByRole("button", { name: "Add me and mark present" }).click();
  await expect(page.getByRole("heading", { name: "Is this you?" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(kid) })).toBeVisible();

  await page.getByRole("button", { name: "No, add me as new" }).click();
  await expect(page.getByText("You're all set 🎉")).toBeVisible();
  expect(await attendanceToday(typo)).toEqual([expect.objectContaining({ source: "self" })]);

  // Exact name: no "add as new" escape hatch.
  await page.goto(`/class/${teensId}/add?name=${encodeURIComponent(kid.toUpperCase())}`);
  await page.getByRole("button", { name: "Add me and mark present" }).click();
  await expect(page.getByRole("heading", { name: "Is this you?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "No, add me as new" })).toHaveCount(0);
});

test("offline while marking: 'No connection. Please try again.', nothing saved, retry works", async ({ browser }) => {
  await openWindow();
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`/class/${teensId}`);
  await page.getByLabel("Start typing your name").pressSequentially(sibling.split(" ").slice(1).join(" "), { delay: 20 });
  await page.getByRole("button", { name: new RegExp(sibling) }).click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Yes, mark me present" }).click();
  await expect(page.getByText("No connection. Please try again.")).toBeVisible();
  expect(await attendanceToday(sibling)).toHaveLength(0);

  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("You're all set 🎉")).toBeVisible();
  expect(await attendanceToday(sibling)).toHaveLength(1);
});
