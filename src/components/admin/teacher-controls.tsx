"use client";

import { KeyRound, Plus, Shuffle } from "lucide-react";

import {
  createTeacher,
  reassignTeacherClass,
  resetTeacherPassword,
  setTeacherActive,
} from "@/app/sundayschool/_actions/teachers";
import { Button } from "@/components/ui/button";

import { ActionButton, ConfirmButton, DialogForm, PasswordField, SelectField, TextField } from "./forms";

type ClassOption = { id: string; name: string };

export function CreateTeacherButton({ classes }: { classes: ClassOption[] }) {
  return (
    <DialogForm
      title="Add a teacher"
      description="Creates their sign-in account. Give them the email and password privately."
      action={createTeacher}
      submitLabel="Create account"
      keepOpenOnSuccess
      trigger={
        <Button disabled={classes.length === 0}>
          <Plus aria-hidden /> Add teacher
        </Button>
      }
    >
      {(errors) => (
        <>
          <TextField name="fullName" label="Full name" required autoComplete="off" error={errors.fullName} />
          <TextField name="email" label="Email" type="email" required autoComplete="off" autoCapitalize="none" error={errors.email} />
          <SelectField
            name="classId"
            label="Class"
            required
            defaultValue=""
            error={errors.classId}
            options={[{ value: "", label: "Choose a class…" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <PasswordField error={errors.password} />
        </>
      )}
    </DialogForm>
  );
}

export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  return (
    <DialogForm
      title={`Reset password for ${name}`}
      description="Their old password stops working straight away, and they are signed out on every device."
      action={resetTeacherPassword}
      submitLabel="Set new password"
      keepOpenOnSuccess
      trigger={
        <Button variant="outline">
          <KeyRound aria-hidden /> Reset password
        </Button>
      }
    >
      {(errors) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <PasswordField label="New password" error={errors.password} />
        </>
      )}
    </DialogForm>
  );
}

export function ReassignClassButton({
  userId,
  name,
  classId,
  classes,
}: {
  userId: string;
  name: string;
  classId: string | null;
  classes: ClassOption[];
}) {
  return (
    <DialogForm
      title={`Change ${name}'s class`}
      description="They will only see the new class from now on."
      action={reassignTeacherClass}
      submitLabel="Change class"
      trigger={
        <Button variant="outline">
          <Shuffle aria-hidden /> Change class
        </Button>
      }
    >
      {(errors) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <SelectField
            name="classId"
            label="Class"
            defaultValue={classId ?? ""}
            error={errors.classId}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
        </>
      )}
    </DialogForm>
  );
}

export function TeacherActiveButton({ userId, name, active }: { userId: string; name: string; active: boolean }) {
  if (!active) return <ActionButton action={() => setTeacherActive(userId, true)}>Reactivate</ActionButton>;
  return (
    <ConfirmButton
      label="Deactivate"
      destructive
      title={`Deactivate ${name}?`}
      description="They're signed out and can't sign in again until you reactivate the account. Nothing they recorded is deleted."
      confirmLabel="Deactivate account"
      action={() => setTeacherActive(userId, false)}
    />
  );
}
