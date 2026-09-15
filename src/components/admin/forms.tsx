"use client";

import { Check, CircleAlert, Copy } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IDLE, type FormState } from "@/lib/admin/form";
import { cn } from "@/lib/utils";

type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

const inputClass =
  "h-12 w-full rounded-xl border-2 border-input bg-card px-3.5 text-base text-foreground focus:border-primary focus:outline-none aria-invalid:border-primary";

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: ReactNode;
  name: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`f-${name}`} className="text-base font-bold">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p className="flex items-start gap-1.5 text-sm font-bold text-primary">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  name,
  label,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<"input"> & { name: string; label: ReactNode; error?: string; hint?: ReactNode }) {
  return (
    <Field label={label} name={name} error={error} hint={hint}>
      <input id={`f-${name}`} name={name} aria-invalid={error ? true : undefined} className={cn(inputClass, className)} {...props} />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  error,
  hint,
  options,
  className,
  ...props
}: React.ComponentProps<"select"> & {
  name: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label} name={name} error={error} hint={hint}>
      <select id={`f-${name}`} name={name} aria-invalid={error ? true : undefined} className={cn(inputClass, className)} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl bg-accent p-3 text-base font-bold text-accent-foreground">
        <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl bg-success-soft p-3 text-base">
      <p className="flex items-start gap-2 font-bold">
        <Check className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        {state.message}
      </p>
      {state.secret && <SecretValue value={state.secret} />}
    </div>
  );
}

function SecretValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded-lg border bg-card px-3 py-2 font-mono text-lg tracking-wide select-all">{value}</code>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            // clipboard blocked; the value is selectable
          }
        }}
      >
        <Copy aria-hidden />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog form: a trigger button that opens a form backed by a server action.
// ---------------------------------------------------------------------------
export function DialogForm({
  trigger,
  title,
  description,
  action,
  submitLabel,
  children,
  keepOpenOnSuccess = false,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: ReactNode;
  action: FormAction;
  submitLabel: string;
  /** Render prop receives field errors from the last submission. */
  children: (errors: Record<string, string>) => ReactNode;
  /** Keep the dialog open to show a success message (e.g. a generated password). */
  keepOpenOnSuccess?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSession((k) => k + 1); // a fresh form (and result) every time it opens
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          {description && <DialogDescription className="text-base">{description}</DialogDescription>}
        </DialogHeader>
        <DialogFormBody
          key={session}
          action={action}
          submitLabel={submitLabel}
          keepOpenOnSuccess={keepOpenOnSuccess}
          close={() => setOpen(false)}
        >
          {children}
        </DialogFormBody>
      </DialogContent>
    </Dialog>
  );
}

function DialogFormBody({
  action,
  submitLabel,
  keepOpenOnSuccess,
  close,
  children,
}: {
  action: FormAction;
  submitLabel: string;
  keepOpenOnSuccess: boolean;
  close: () => void;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.status === "success" && !keepOpenOnSuccess) close();
    return result;
  }, IDLE);

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const done = keepOpenOnSuccess && state.status === "success";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!done && children(errors)}
      <FormMessage state={state} />
      <DialogFooter className="gap-2">
        {done ? (
          <Button type="button" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </>
        )}
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Confirm button: "Are you sure?" before a one-shot action.
// ---------------------------------------------------------------------------
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  action,
  variant = "outline",
  destructive = false,
  size,
}: {
  label: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  action: () => Promise<FormState>;
  variant?: "outline" | "ghost" | "default" | "secondary";
  destructive?: boolean;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<FormState>(IDLE);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setResult(IDLE);
      }}
    >
      <DialogTrigger render={<Button variant={variant} size={size} className={cn(destructive && "text-primary")} />}>
        {label}
      </DialogTrigger>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-base">{description}</DialogDescription>
        </DialogHeader>
        <FormMessage state={result} />
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await action();
                if (r.status === "success") setOpen(false);
                else setResult(r);
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A plain button that runs an action immediately and shows errors inline. */
export function ActionButton({
  children,
  action,
  variant = "outline",
  size,
}: {
  children: ReactNode;
  action: () => Promise<FormState>;
  variant?: "outline" | "ghost" | "default";
  size?: "default" | "sm";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await action();
            setError(r.status === "error" ? r.message : null);
          })
        }
      >
        {children}
      </Button>
      {error && <span className="text-sm font-bold text-primary">{error}</span>}
    </span>
  );
}

/** Human-friendly temporary password: no look-alike characters. */
export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

export function PasswordField({ error, label = "Temporary password" }: { error?: string; label?: string }) {
  const [value, setValue] = useState("");
  return (
    <Field label={label} name="password" error={error} hint="At least 10 characters. Share it privately; they can use it to sign in.">
      <div className="flex gap-2">
        <input
          id="f-password"
          name="password"
          type="text"
          autoComplete="new-password"
          required
          minLength={10}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={cn(inputClass, "font-mono")}
        />
        <Button type="button" variant="outline" onClick={() => setValue(generatePassword())}>
          Generate
        </Button>
      </div>
    </Field>
  );
}
