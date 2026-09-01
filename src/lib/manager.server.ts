/**
 * Server-only helpers for Hola AI Manager (HAIM).
 * Access requires BOTH: a signed-in account whose email is on the staff list,
 * and the shared staff passcode.
 */

// SHA-256 of the staff passcode. The passcode itself is never stored in code.
const PASSCODE_HASH =
  "809982a5085e665280193cb7eafec9981350632bb4cc34d5d36aa1d171d73ca3";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkPasscode(passcode: string): Promise<boolean> {
  if (!passcode) return false;
  const hash = await sha256Hex(passcode);
  // constant-ish time comparison
  if (hash.length !== PASSCODE_HASH.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ PASSCODE_HASH.charCodeAt(i);
  return diff === 0;
}

export async function isStaffEmail(email: string | undefined | null): Promise<boolean> {
  if (!email) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("manager_staff")
    .select("email")
    .ilike("email", email)
    .maybeSingle();
  return Boolean(data);
}

/** Throws unless the caller is staff AND supplied the right passcode. */
export async function assertManager(email: string | undefined, passcode: string) {
  if (!(await isStaffEmail(email))) throw new Error("This account is not allowed in Hola Manager.");
  if (!(await checkPasscode(passcode))) throw new Error("Wrong passcode.");
}
