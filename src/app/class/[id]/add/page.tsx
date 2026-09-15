import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AddStudentScreen } from "@/components/student/add-student-screen";
import { ClassClosed } from "@/components/student/class-closed";
import { ServiceUnavailable } from "@/components/student/service-unavailable";
import { getClasses } from "@/lib/attendance/rpc";

export const metadata: Metadata = { title: "Add your name" };

export default async function AddStudentPage(props: PageProps<"/class/[id]/add">) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  await connection();

  const result = await getClasses();
  if (!result.ok) return <ServiceUnavailable />;

  const { window, classes } = result.data;
  const cls = classes.find((c) => c.id === id);
  if (!cls) notFound();

  if (!window.is_open) return <ClassClosed className={cls.name} window={window} />;

  const name = typeof searchParams.name === "string" ? searchParams.name.slice(0, 100) : "";

  return <AddStudentScreen classId={cls.id} className={cls.name} timeZone={window.timezone} initialName={name} />;
}
