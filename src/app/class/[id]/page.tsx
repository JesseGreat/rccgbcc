import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ClassClosed } from "@/components/student/class-closed";
import { SearchScreen } from "@/components/student/search-screen";
import { ServiceUnavailable } from "@/components/student/service-unavailable";
import { getClasses } from "@/lib/attendance/rpc";

export const metadata: Metadata = { title: "Find your name" };

export default async function ClassPage(props: PageProps<"/class/[id]">) {
  const { id } = await props.params;
  await connection();

  const result = await getClasses();
  if (!result.ok) return <ServiceUnavailable />;

  const { window, classes } = result.data;
  const cls = classes.find((c) => c.id === id);
  if (!cls) notFound();

  if (!window.is_open) return <ClassClosed className={cls.name} window={window} />;

  return <SearchScreen classId={cls.id} className={cls.name} timeZone={window.timezone} />;
}
