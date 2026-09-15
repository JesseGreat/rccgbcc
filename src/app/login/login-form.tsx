"use client";

import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/auth/actions";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const [showPassword, setShowPassword] = useState(false);
  const message = state.error ?? notice;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      {message && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-accent p-3 text-base font-bold text-accent-foreground">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          {message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-lg font-bold">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          defaultValue={state.email}
          className="h-14 text-lg"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-lg font-bold">
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-14 pr-14 text-lg"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1 flex size-12 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground"
          >
            {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full text-xl">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
