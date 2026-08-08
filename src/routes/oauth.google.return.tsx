import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeGoogleConnect } from "@/lib/google.functions";

export const Route = createFileRoute("/oauth/google/return")({
  component: OAuthReturn,
  head: () => ({
    meta: [
      { title: "Connecting Google — Hola AI" },
      { name: "description", content: "Finishing your Google connection for Hola AI." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finishing your Google connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed") => {
      window.opener?.postMessage(
        { type, connectorId: params.get("connector_id") ?? "google" },
        window.location.origin,
      );
      window.close();
    };
    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "Google sign-in did not complete.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Google returned no exchange code.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    void completeGoogleConnect({ data: { code } })
      .then(() => notify("appUserConnectorOAuthComplete"))
      .catch(() => {
        setMessage("Could not finish the Google connection.");
        notify("appUserConnectorOAuthFailed");
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">
      <p>{message}</p>
    </div>
  );
}
