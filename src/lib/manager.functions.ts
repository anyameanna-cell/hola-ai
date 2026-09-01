import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface Passcoded {
  passcode: string;
}

function email(context: { claims?: Record<string, unknown> }): string | undefined {
  const c = context.claims as { email?: string } | undefined;
  return c?.email;
}

/** Verify staff email + passcode. */
export const managerSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Passcoded) => d)
  .handler(async ({ data, context }) => {
    const { assertManager } = await import("@/lib/manager.server");
    const mail = email(context);
    await assertManager(mail, data.passcode);
    return { ok: true as const, email: mail ?? "" };
  });

export const managerListStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Passcoded) => d)
  .handler(async ({ data, context }) => {
    const { assertManager } = await import("@/lib/manager.server");
    await assertManager(email(context), data.passcode);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("manager_staff")
      .select("email, created_at")
      .order("created_at", { ascending: true });
    return rows ?? [];
  });

export const managerAddStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Passcoded & { newEmail: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertManager } = await import("@/lib/manager.server");
    const mail = email(context);
    await assertManager(mail, data.passcode);
    const target = data.newEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) throw new Error("That doesn't look like an email address.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("manager_staff")
      .upsert({ email: target, added_by: context.userId }, { onConflict: "email" });
    if (error) throw new Error(error.message);
    return { ok: true as const, email: target };
  });

export const managerRemoveStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Passcoded & { targetEmail: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertManager } = await import("@/lib/manager.server");
    const mail = email(context);
    await assertManager(mail, data.passcode);
    const target = data.targetEmail.trim().toLowerCase();
    if (target === (mail ?? "").toLowerCase()) throw new Error("You can't remove your own access.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("manager_staff").delete().eq("email", target);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Publish a rich notification to every user of the app. */
export const managerPublishNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Passcoded & { title: string; html: string; imageUrl?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertManager } = await import("@/lib/manager.server");
    await assertManager(email(context), data.passcode);
    const title = data.title.trim().slice(0, 120);
    if (!title) throw new Error("Give the notification a title.");
    const plain = data.html.replace(/<[^>]*>/g, "").trim();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error: uErr } = await supabaseAdmin.from("profiles").select("id");
    if (uErr) throw new Error(uErr.message);
    const rows = (users ?? []).map((u) => ({
      user_id: u.id,
      title,
      body: plain.slice(0, 2000),
      body_html: data.html.slice(0, 20000),
      image_url: data.imageUrl ?? null,
      broadcast: true,
    }));
    if (!rows.length) return { ok: true as const, sent: 0 };
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseAdmin.from("notifications").insert(rows.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }
    return { ok: true as const, sent: rows.length };
  });

/** Recipient list for the email sender. */
export const managerListUserEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Passcoded) => d)
  .handler(async ({ data, context }) => {
    const { assertManager } = await import("@/lib/manager.server");
    await assertManager(email(context), data.passcode);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    return list.users.map((u) => u.email).filter((e): e is string => Boolean(e));
  });

/** Send an email to users. Requires a connected sender domain. */
export const managerSendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Passcoded & { to: string[]; subject: string; html: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertManager } = await import("@/lib/manager.server");
    await assertManager(email(context), data.passcode);
    if (!data.to.length) throw new Error("Pick at least one recipient.");
    if (!data.subject.trim()) throw new Error("Give the email a subject.");

    const from = process.env["EMAIL_FROM"];
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!from || !apiKey) {
      throw new Error(
        "Email sending isn't switched on yet — a sender domain has to be connected to the app first. Ask the owner to set up the email domain, then this starts working.",
      );
    }
    const { sendLovableEmail } = await import("@lovable.dev/email-js");
    const text = data.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    let sent = 0;
    for (const to of data.to) {
      await sendLovableEmail(
        { from, to, subject: data.subject, html: data.html, text },
        { apiKey },
      );
      sent++;
    }
    return { ok: true as const, sent };
  });
