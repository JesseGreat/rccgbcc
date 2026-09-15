"use client";

import { Pencil, Plus } from "lucide-react";

import { createClass, setClassActive, updateClass } from "@/app/sundayschool/_actions/classes";
import { Button } from "@/components/ui/button";

import { ActionButton, ConfirmButton, DialogForm, TextField } from "./forms";

export function CreateClassButton() {
  return (
    <DialogForm
      title="New class"
      action={createClass}
      submitLabel="Create class"
      trigger={
        <Button>
          <Plus aria-hidden /> New class
        </Button>
      }
    >
      {(errors) => (
        <>
          <TextField name="name" label="Class name" required maxLength={80} error={errors.name} placeholder="e.g. Teens" />
          <TextField name="description" label="Description (optional)" maxLength={200} error={errors.description} placeholder="e.g. Ages 13–19" />
        </>
      )}
    </DialogForm>
  );
}

export function EditClassButton({ cls }: { cls: { id: string; name: string; description: string | null } }) {
  return (
    <DialogForm
      title={`Edit ${cls.name}`}
      action={updateClass}
      submitLabel="Save"
      trigger={
        <Button variant="outline">
          <Pencil aria-hidden /> Edit
        </Button>
      }
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={cls.id} />
          <TextField name="name" label="Class name" required maxLength={80} defaultValue={cls.name} error={errors.name} />
          <TextField
            name="description"
            label="Description (optional)"
            maxLength={200}
            defaultValue={cls.description ?? ""}
            error={errors.description}
          />
        </>
      )}
    </DialogForm>
  );
}

export function ClassActiveButton({ cls }: { cls: { id: string; name: string; is_active: boolean } }) {
  if (!cls.is_active) {
    return <ActionButton action={() => setClassActive(cls.id, true)}>Reactivate</ActionButton>;
  }
  return (
    <ConfirmButton
      label="Deactivate"
      destructive
      title={`Deactivate ${cls.name}?`}
      description="Students won't see this class any more. Its students, teachers and attendance history are kept, and you can reactivate it at any time."
      confirmLabel="Deactivate class"
      action={() => setClassActive(cls.id, false)}
    />
  );
}
