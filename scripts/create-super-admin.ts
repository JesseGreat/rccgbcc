// Creates (or promotes) a super admin. This is how the very first account is made:
// there is no signup page anywhere in the app.
//
// Usage:
//   pnpm create-super-admin --email you@church.org --name "Your Name"
//
// The password is read from SUPER_ADMIN_PASSWORD if set, otherwise prompted for
// (hidden). An existing user with that email is promoted and their password reset.

import { createInterface } from "node:readline";

import { createAdminClient, ensureStaffUser, fail, findUserByEmail } from "./lib/admin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let prompted = false;
    output._writeToOutput = (s: string) => {
      if (!prompted) {
        output.output.write(s);
        prompted = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = arg("email");
  const name = arg("name");
  if (!email || !name) fail('Usage: pnpm create-super-admin --email you@church.org --name "Your Name"');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" is not a valid email address.`);

  const password = process.env.SUPER_ADMIN_PASSWORD ?? (await promptHidden("Password (min 10 characters): "));
  if (password.length < 10) fail("Password must be at least 10 characters.");

  const { client, url } = createAdminClient();
  const existing = await findUserByEmail(client, email);

  const { id } = await ensureStaffUser(
    client,
    { email, password, fullName: name, role: "super_admin", classId: null },
    { resetPassword: true },
  );

  await client.from("audit_log").insert({
    actor_id: null,
    action: existing ? "profiles.promote_super_admin_cli" : "profiles.create_super_admin_cli",
    entity: "profiles",
    entity_id: id,
    details: { email, full_name: name },
  });

  console.log(`\n✔ Super admin ${existing ? "updated" : "created"}: ${email} on ${url}\n`);
}

main().catch((error) => fail(error instanceof Error ? error.message : JSON.stringify(error)));
