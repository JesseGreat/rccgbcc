"use client";

import { Merge, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

import {
  createStudent,
  deleteStudent,
  resolveFlag,
  setStudentActive,
  updateStudent,
} from "@/app/sundayschool/_actions/students";
import { Button } from "@/components/ui/button";

import { ActionButton, ConfirmButton, DialogForm, SelectField, TextField } from "./forms";

type ClassOption = { id: string; name: string };
export type AdminStudent = {
  id: string;
  full_name: string;
  phone: string | null;
  gender: string | null;
  age_group: string | null;
  class_id: string;
  is_active: boolean;
};

function StudentFields({
  errors,
  classes,
  student,
}: {
  errors: Record<string, string>;
  classes: ClassOption[];
  student?: AdminStudent;
}) {
  return (
    <>
      <TextField name="fullName" label="Full name" required maxLength={100} defaultValue={student?.full_name} error={errors.fullName} />
      <SelectField
        name="classId"
        label="Class"
        required
        defaultValue={student?.class_id ?? ""}
        error={errors.classId}
        hint={student ? "Moving a student moves their attendance history too." : undefined}
        options={[...(student ? [] : [{ value: "", label: "Choose a class…" }]), ...classes.map((c) => ({ value: c.id, label: c.name }))]}
      />
      <TextField name="phone" label="Phone (optional)" type="tel" inputMode="tel" defaultValue={student?.phone ?? ""} error={errors.phone} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="gender"
          label="Gender (optional)"
          defaultValue={student?.gender ?? ""}
          error={errors.gender}
          options={[
            { value: "", label: "Not recorded" },
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
        />
        <TextField name="ageGroup" label="Age group (optional)" maxLength={40} defaultValue={student?.age_group ?? ""} error={errors.ageGroup} />
      </div>
    </>
  );
}

export function CreateStudentButton({ classes }: { classes: ClassOption[] }) {
  return (
    <DialogForm
      title="Add a student"
      action={createStudent}
      submitLabel="Add student"
      trigger={
        <Button>
          <Plus aria-hidden /> Add student
        </Button>
      }
    >
      {(errors) => <StudentFields errors={errors} classes={classes} />}
    </DialogForm>
  );
}

export function EditStudentButton({ student, classes }: { student: AdminStudent; classes: ClassOption[] }) {
  return (
    <DialogForm
      title={`Edit ${student.full_name}`}
      action={updateStudent}
      submitLabel="Save"
      trigger={
        <Button variant="outline" size="sm">
          <Pencil aria-hidden /> Edit
        </Button>
      }
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={student.id} />
          <StudentFields errors={errors} classes={classes} student={student} />
        </>
      )}
    </DialogForm>
  );
}

export function StudentRowActions({
  student,
  classes,
  attendanceCount,
}: {
  student: AdminStudent;
  classes: ClassOption[];
  attendanceCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <EditStudentButton student={student} classes={classes} />
      <Button variant="outline" size="sm" render={<Link href={`/sundayschool/students/merge?a=${student.id}`} />}>
        <Merge aria-hidden /> Merge
      </Button>
      {student.is_active ? (
        <ConfirmButton
          size="sm"
          label="Deactivate"
          destructive
          title={`Deactivate ${student.full_name}?`}
          description="They'll no longer appear in search or on teachers' rosters. Their attendance history is kept."
          confirmLabel="Deactivate"
          action={() => setStudentActive(student.id, false)}
        />
      ) : (
        <ActionButton size="sm" action={() => setStudentActive(student.id, true)}>
          Reactivate
        </ActionButton>
      )}
      {attendanceCount === 0 && (
        <ConfirmButton
          size="sm"
          variant="ghost"
          destructive
          label={
            <>
              <Trash2 aria-hidden /> Delete
            </>
          }
          title={`Delete ${student.full_name}?`}
          description="This record has no attendance, so it can be removed completely. This can't be undone."
          confirmLabel="Delete permanently"
          action={() => deleteStudent(student.id)}
        />
      )}
    </div>
  );
}

export function FlagActions({ flagId, studentId }: { flagId: string; studentId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" render={<Link href={`/sundayschool/students/merge?a=${studentId}`} />}>
        <Merge aria-hidden /> Merge…
      </Button>
      <ActionButton size="sm" action={() => resolveFlag(flagId, "resolved")}>
        Mark fixed
      </ActionButton>
      <ActionButton size="sm" variant="ghost" action={() => resolveFlag(flagId, "dismissed")}>
        Dismiss
      </ActionButton>
    </div>
  );
}
