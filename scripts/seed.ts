// Seeds a development database with realistic sample data:
//   - one super admin
//   - 4 classes (Teens, Young Adults, Men, Women), one teacher each
//   - 15 students per class
//   - ~4 months of Sunday attendance history (not including today)
//
// Usage:  pnpm db:seed            (local Supabase only)
//         pnpm db:seed --remote   (explicitly allow a hosted project)
//
// Safe to re-run: existing users, classes, students and attendance are kept.

import { createAdminClient, ensureStaffUser, fail, isLocalUrl, type AdminClient } from "./lib/admin";

const SUNDAYS_OF_HISTORY = 17;
const TIMEZONE_OFFSET = "+01:00"; // Africa/Lagos has no DST

const CLASSES: { name: string; description: string; teacher: string; teacherEmail: string; students: string[] }[] = [
  {
    name: "Teens",
    description: "Ages 13–19",
    teacher: "Bisi Olatunji",
    teacherEmail: "teens.teacher@bethel.local",
    students: [
      "Chidi Okafor", "Ngozi Adeyemi", "Tunde Bakare", "Amaka Eze", "Emeka Obi",
      "Funke Adebayo", "Kelechi Nwosu", "Yetunde Balogun", "Ifeanyi Chukwu", "Temitope Alade",
      "Damilola Ogunleye", "Chiamaka Igwe", "Seyi Afolabi", "Blessing Umeh", "David Olawale",
    ],
  },
  {
    name: "Young Adults",
    description: "Ages 20–35",
    teacher: "Kunle Adeniran",
    teacherEmail: "youngadults.teacher@bethel.local",
    students: [
      "Oluwaseun Adewale", "Adaeze Nnamdi", "Tobi Fashola", "Esther Okonkwo", "Samuel Oyelaran",
      "Grace Ekwueme", "Michael Adigun", "Ruth Onyekachi", "Victor Ajayi", "Deborah Ikenna",
      "Joshua Akinola", "Precious Uzor", "Daniel Obaseki", "Favour Anyanwu", "Peter Olaniyan",
    ],
  },
  {
    name: "Men",
    description: "Men's fellowship class",
    teacher: "Pastor Gbenga Ojo",
    teacherEmail: "men.teacher@bethel.local",
    students: [
      "Segun Ojo", "Ibrahim Musa", "Chinedu Okeke", "Babatunde Adeyinka", "Emmanuel Nwachukwu",
      "Olumide Bello", "Ikechukwu Agu", "Femi Oyebanji", "Uche Nwankwo", "Adewale Ogunbiyi",
      "Joseph Etim", "Rotimi Salami", "Godwin Okoro", "Yusuf Adamu", "Tayo Ilesanmi",
    ],
  },
  {
    name: "Women",
    description: "Women's fellowship class",
    teacher: "Deaconess Folake Ade",
    teacherEmail: "women.teacher@bethel.local",
    students: [
      "Folasade Adeyemo", "Nkechi Obiora", "Aisha Bello", "Bukola Ogunsanya", "Chioma Onwuka",
      "Modupe Akande", "Patience Eke", "Omolara Fadipe", "Ebere Okoye", "Titilayo Oni",
      "Hauwa Ibrahim", "Kemi Adeleke", "Ifeoma Nwosu", "Mercy Udoh", "Sade Olowu",
    ],
  },
];

async function main() {
  const { client, url } = createAdminClient();
  if (!isLocalUrl(url) && !process.argv.includes("--remote")) {
    fail(`Refusing to seed sample data into ${url}. Pass --remote if you really mean it.`);
  }

  const adminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@bethel.local";
  const adminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD;
  if (!adminPassword || adminPassword.length < 10) fail("SEED_SUPER_ADMIN_PASSWORD must be set (10+ characters).");
  if (!teacherPassword || teacherPassword.length < 10) fail("SEED_TEACHER_PASSWORD must be set (10+ characters).");

  const rand = mulberry32(20260913);

  console.log(`Seeding ${url}\n`);

  const admin = await ensureStaffUser(client, {
    email: adminEmail,
    password: adminPassword,
    fullName: "Sunday School Superintendent",
    role: "super_admin",
    classId: null,
  });
  console.log(`  super admin   ${adminEmail}${admin.created ? "" : " (existing)"}`);

  const sundays = pastSundays(SUNDAYS_OF_HISTORY);
  let totalMarks = 0;

  for (const spec of CLASSES) {
    const classId = await ensureClass(client, spec.name, spec.description);

    const teacher = await ensureStaffUser(client, {
      email: spec.teacherEmail,
      password: teacherPassword,
      fullName: spec.teacher,
      role: "teacher",
      classId,
    });

    const students = await ensureStudents(client, classId, spec.students, rand);
    const rows = buildAttendance(students, classId, sundays, rand);

    for (const batch of chunk(rows, 500)) {
      const { error } = await client
        .from("attendance")
        .upsert(batch, { onConflict: "student_id,service_date", ignoreDuplicates: true });
      if (error) throw error;
    }
    totalMarks += rows.length;

    console.log(
      `  ${spec.name.padEnd(13)} teacher ${spec.teacherEmail}${teacher.created ? "" : " (existing)"}, ` +
        `${students.length} students, ${rows.length} marks`,
    );
  }

  await client.from("audit_log").insert({
    actor_id: null,
    action: "seed.run",
    entity: "database",
    details: { classes: CLASSES.length, sundays: sundays.length, marks: totalMarks },
  });

  console.log(`\n✔ Done. ${sundays.length} Sundays of history (${sundays.at(-1)} → ${sundays[0]}).`);
  console.log(`  Sign in as ${adminEmail} or any teacher above with the passwords from your env.\n`);
}

async function ensureClass(client: AdminClient, name: string, description: string): Promise<string> {
  const { data: existing, error } = await client.from("classes").select("id").ilike("name", name).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;

  const { data, error: insertError } = await client
    .from("classes")
    .insert({ name, description })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return data.id;
}

type SeedStudent = { id: string; propensity: number; joinedAfter: number; deviceHash: string };

async function ensureStudents(
  client: AdminClient,
  classId: string,
  names: string[],
  rand: () => number,
): Promise<SeedStudent[]> {
  const rows = names.map((full_name, i) => ({
    class_id: classId,
    full_name,
    phone: i % 3 === 0 ? `080${String(30000000 + Math.floor(rand() * 9999999)).padStart(8, "0")}` : null,
    created_by: i % 4 === 0 ? "self" : "seed",
  }));

  const { error } = await client
    .from("students")
    .upsert(rows, { onConflict: "class_id,normalized_name", ignoreDuplicates: true });
  if (error) throw error;

  const { data, error: selectError } = await client
    .from("students")
    .select("id, full_name")
    .eq("class_id", classId)
    .in("full_name", names);
  if (selectError) throw selectError;

  return data.map((s) => ({
    id: s.id,
    // Regulars attend ~90% of Sundays, occasional attendees ~45%.
    propensity: 0.45 + rand() * 0.5,
    // A few students joined partway through the period.
    joinedAfter: rand() < 0.2 ? Math.floor(rand() * 8) : 0,
    deviceHash: `seed-${randomHex(rand, 24)}`,
  }));
}

function buildAttendance(students: SeedStudent[], classId: string, sundays: string[], rand: () => number) {
  const oldestFirst = [...sundays].reverse();
  const rows: {
    student_id: string;
    class_id: string;
    service_date: string;
    marked_at: string;
    source: "self" | "teacher";
    device_hash: string | null;
  }[] = [];

  for (const student of students) {
    oldestFirst.forEach((date, week) => {
      if (week < student.joinedAfter || rand() > student.propensity) return;
      const byTeacher = rand() < 0.12;
      const minute = Math.floor(rand() * 40);
      const second = Math.floor(rand() * 60);
      rows.push({
        student_id: student.id,
        class_id: classId,
        service_date: date,
        marked_at: `${date}T08:${pad(minute)}:${pad(second)}${TIMEZONE_OFFSET}`,
        source: byTeacher ? "teacher" : "self",
        device_hash: byTeacher ? null : student.deviceHash,
      });
    });
  }
  return rows;
}

/** The last `count` Sundays strictly before today in Lagos, newest first (YYYY-MM-DD). */
function pastSundays(count: number): string[] {
  const todayLagos = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const cursor = new Date(`${todayLagos}T12:00:00Z`);
  const dow = cursor.getUTCDay();
  cursor.setUTCDate(cursor.getUTCDate() - (dow === 0 ? 7 : dow));
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return dates;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomHex(rand: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(rand() * 16).toString(16);
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

main().catch((error) => fail(error instanceof Error ? error.message : JSON.stringify(error)));
