// Server-only: read-only Google actions executed as the app user via the connector gateway.
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "@/server/appUserConnections.server";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const GMAIL_CONNECTOR = "google_mail";
export const SHEETS_CONNECTOR = "google_sheets";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export function clientApiKeyFor(connectorId: string): string | null {
  const map: Record<string, string | undefined> = {
    [GMAIL_CONNECTOR]: process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"],
    [SHEETS_CONNECTOR]: process.env["GOOGLE_SHEETS_APP_USER_CONNECTOR_CLIENT_API_KEY"],
  };
  return map[connectorId] ?? null;
}

export class GoogleActionError extends Error {
  constructor(message: string, readonly code: "not_configured" | "not_connected" | "provider_error") {
    super(message);
  }
}

async function callGoogle(userId: string, connectorId: string, path: string) {
  if (!clientApiKeyFor(connectorId)) {
    throw new GoogleActionError(
      "Google access isn't set up for this app yet (missing connector client).",
      "not_configured",
    );
  }
  const connectionAPIKey = await getConnectionKeyForUser(userId, connectorId);
  if (!connectionAPIKey) {
    throw new GoogleActionError("You haven't connected this Google service yet.", "not_connected");
  }
  const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId, path });
  const text = await res.text();
  if (!res.ok) {
    throw new GoogleActionError(`Google request failed [${res.status}]: ${text.slice(0, 300)}`, "provider_error");
  }
  return text ? JSON.parse(text) : {};
}

export interface GmailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export async function gmailRecent(
  userId: string,
  opts: { query?: string; limit?: number } = {},
): Promise<GmailSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10);
  const q = opts.query ? `&q=${encodeURIComponent(opts.query)}` : "";
  const list = (await callGoogle(
    userId,
    GMAIL_CONNECTOR,
    `/gmail/v1/users/me/messages?maxResults=${limit}${q}`,
  )) as { messages?: { id: string }[] };

  const ids = (list.messages ?? []).slice(0, limit).map((m) => m.id);
  const results: GmailSummary[] = [];
  for (const id of ids) {
    const msg = (await callGoogle(
      userId,
      GMAIL_CONNECTOR,
      `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    )) as { snippet?: string; payload?: { headers?: { name: string; value: string }[] } };
    const header = (name: string) =>
      msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
    results.push({
      id,
      from: header("from"),
      subject: header("subject") || "(no subject)",
      date: header("date"),
      snippet: (msg.snippet ?? "").slice(0, 200),
    });
  }
  return results;
}

export async function gmailProfile(userId: string) {
  return (await callGoogle(userId, GMAIL_CONNECTOR, "/gmail/v1/users/me/profile")) as {
    emailAddress?: string;
    messagesTotal?: number;
  };
}

export async function sheetsInfo(userId: string, spreadsheetId: string) {
  const data = (await callGoogle(
    userId,
    SHEETS_CONNECTOR,
    `/sheets/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
  )) as { properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] };
  return {
    title: data.properties?.title ?? "(untitled)",
    tabs: (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean),
  };
}

export async function sheetsRead(userId: string, spreadsheetId: string, range: string) {
  const data = (await callGoogle(
    userId,
    SHEETS_CONNECTOR,
    `/sheets/v4/spreadsheets/${spreadsheetId}/values/${range}`,
  )) as { range?: string; values?: string[][] };
  return { range: data.range ?? range, values: (data.values ?? []).slice(0, 50) };
}

export function extractSpreadsheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?.[1] ?? input.trim();
}

export function formatGmailForText(items: GmailSummary[]): string {
  if (items.length === 0) return "No matching emails found.";
  return items
    .map((m, i) => `${i + 1}. ${m.subject}\n   from: ${m.from}\n   ${m.snippet}`)
    .join("\n\n");
}

export function formatSheetValuesForText(values: string[][]): string {
  if (values.length === 0) return "No values in that range.";
  return values.map((row) => row.join(" | ")).join("\n");
}
