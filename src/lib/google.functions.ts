import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CONNECTORS = ["google_mail", "google_sheets"] as const;
type ConnectorId = (typeof CONNECTORS)[number];

function assertConnector(id: string): ConnectorId {
  if (!CONNECTORS.includes(id as ConnectorId)) throw new Error("Unsupported connector");
  return id as ConnectorId;
}

/** Start per-user Google OAuth (read-only scopes) and return the consent URL. */
export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectorId: string }) => input)
  .handler(async ({ data, context }) => {
    const connectorId = assertConnector(data.connectorId);
    const {
      GATEWAY_BASE_URL,
      GMAIL_CONNECTOR,
      GMAIL_SCOPES,
      SHEETS_SCOPES,
      clientApiKeyFor,
    } = await import("@/server/googleActions.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");

    const clientAPIKey = clientApiKeyFor(connectorId);
    if (!clientAPIKey) {
      throw new Error(
        "Google access isn't set up for this app yet — an admin needs to configure the Google App User Connector client.",
      );
    }
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const returnUrl = new URL("/oauth/google/return", request.url).toString();

    const existing = await getConnectionKeyForUser(context.userId, connectorId);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: {
        scopes: connectorId === GMAIL_CONNECTOR ? GMAIL_SCOPES : SHEETS_SCOPES,
      },
    });
    return { authorizationUrl };
  });

/** Exchange the one-time OAuth code for the per-user connection key and store it encrypted. */
export const completeGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data, context }) => {
    const { GATEWAY_BASE_URL } = await import("@/server/googleActions.server");
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    assertConnector(connectorId);
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true, connectorId };
  });

export const getGoogleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { clientApiKeyFor } = await import("@/server/googleActions.server");
    const { listConnectedConnectors } = await import("@/server/appUserConnections.server");
    const connected = await listConnectedConnectors(context.userId);
    return {
      userId: context.userId,
      connectors: CONNECTORS.map((id) => ({
        id,
        configured: Boolean(clientApiKeyFor(id)),
        connected: connected.includes(id),
      })),
    };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectorId: string }) => input)
  .handler(async ({ data, context }) => {
    const connectorId = assertConnector(data.connectorId);
    const { GATEWAY_BASE_URL } = await import("@/server/googleActions.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, connectorId);
    if (connectionAPIKey) {
      try {
        await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId });
      } catch {
        /* still drop the local row */
      }
    }
    await deleteConnectionForUser(context.userId, connectorId);
    return { ok: true };
  });

/** Read-only Gmail preview for the signed-in user. */
export const readGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query?: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { gmailRecent, gmailProfile } = await import("@/server/googleActions.server");
    const [profile, messages] = await Promise.all([
      gmailProfile(context.userId).catch(() => ({ emailAddress: undefined })),
      gmailRecent(context.userId, { query: data.query, limit: data.limit ?? 5 }),
    ]);
    return { account: profile.emailAddress ?? null, messages };
  });

/** Read-only Google Sheets values for the signed-in user. */
export const readSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { spreadsheet: string; range?: string }) => input)
  .handler(async ({ data, context }) => {
    const { sheetsInfo, sheetsRead, extractSpreadsheetId } = await import(
      "@/server/googleActions.server"
    );
    const id = extractSpreadsheetId(data.spreadsheet);
    const info = await sheetsInfo(context.userId, id);
    const range = data.range || `${info.tabs[0] ?? "Sheet1"}!A1:F20`;
    const values = await sheetsRead(context.userId, id, range);
    return { title: info.title, tabs: info.tabs, ...values };
  });
