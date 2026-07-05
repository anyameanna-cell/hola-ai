## Reality check

"Everything if possible" in one turn is not possible — you'd get 15 half-broken features. Below is the shortest realistic sequence, split into shippable turns. Each turn ends with a working, testable state.

**Skipped per your answers:** admin Live Code Sandbox / mock repo tree / hot-swap deploy UI (cosmetic, dropped).

**Blocked on you:** Per-user Google OAuth requires YOU to create a Google Cloud project, OAuth consent screen, and OAuth client credentials (Client ID + Client Secret) in Google Cloud Console. I can't do that step. Same for Telegram: you must create a bot with @BotFather and give me the bot token. Same for WhatsApp/Discord (out of scope, not adding — WhatsApp Business API needs a Meta business account + verification, weeks of setup).

## Turn 1 — Bug fixes + branded loader + contact→admin→notifications (this turn)

Ship end-to-end:

1. **Ultra Memory global.** Currently memories fetch scoped by thread. Change `src/routes/api/chat.ts` to always load ALL rows from `memories` for the authenticated user (already the case per schema — verify and log). Add explicit log line so we can see what's injected.
2. **display_name sync.** `SettingsDialog` upsert → dispatch `profile-changed` event → `ChatSidebar` + `ChatWindow` re-read profile. Prompt reads freshest `display_name` on each request (already does via `buildSystemPrompt`, but double-check the fetch happens at request time, not from stale closure).
3. **Image gen pipeline.** Verify `/api/generate-image` streaming returns valid data URL, render in a fixed-aspect placeholder box in `MessageBubble` with the existing brush-orbit animation until final frame.
4. **Input jitter.** Give chat composer a fixed `min-height` container and `contain: layout` so typing doesn't reflow siblings.
5. **Diagram width.** Remove `max-width: 100%` on `.mermaid-host svg`; wrap in an overflow-x scroll container instead so nodes never clip.
6. **Themed loading dots.** Streaming caret + typing dots use `var(--color-primary)` instead of hardcoded pink.
7. **White-screen fix.** Add a top-level `<ErrorBoundary>` in `__root.tsx` that logs to console + shows recovery UI. Never blank.
8. **HolaLoader wired.** Use as suspense fallback in `__root.tsx` and route-level pending states.
9. **Contact form + admin inbox + notifications:**
   - Migration: `contact_messages(id, user_id, subject, body, status, created_at)` + `notifications(id, user_id, title, body, read, created_at)` with proper GRANTs + RLS (`user_id = auth.uid()` for own read/insert; admins read/update all via `has_role`).
   - `/contact` route: form → insert into `contact_messages`.
   - `/_authenticated/admin/inbox`: gated by `has_role(auth.uid(),'admin')`; list messages, reply textarea → inserts `notifications` row for that user.
   - Notification bell in header: subscribes to `notifications` via realtime, badge count, dropdown list, mark-read.

## Turn 2 — Call mode

Push-to-talk modal:
- Web Audio API capture → WAV chunks → `/api/transcribe` server route → Lovable AI STT streaming → insert transcript as user message → reuse existing chat pipeline → TTS reply via existing `/api/tts`.
- No camera, no screen share.

## Turn 3 — Per-user Google OAuth + Gmail/Sheets read

Requires from you first:
- Google Cloud project + OAuth consent screen configured
- OAuth Client ID + Client Secret (I'll request via `add_secret`)
- Enable Gmail API + Sheets API in that project

Then I build:
- OAuth flow storing per-user refresh tokens in a new `google_tokens` table (RLS: own-row only)
- Settings page "Connect Google" button
- Server tools: `gmail.list`, `gmail.read`, `sheets.read` exposed to Hola via tool-calls
- Once read is verified working: `gmail.send`, `sheets.append` (writes)

## Turn 4 — Telegram bridge

Requires from you first:
- Bot token from @BotFather
- A `telegram_links` table mapping Telegram user_id → your app's user_id (users link via `/start <code>` in Telegram)

Then I build:
- `/api/public/telegram/webhook` route with HMAC-derived secret verification
- Set webhook via connector gateway
- Incoming Telegram message → find linked user → run through Hola → reply via `sendMessage`

## Explicitly NOT doing

- Fake IDE / mock repo tree / ZIP export / hot-swap UI (you said skip)
- WhatsApp, Discord bridges (weeks of provider setup; scope creep)
- Video generation (no reliable cheap text-to-video wired into Lovable AI; would be a stub only)
- Editing your GitHub repo from the admin page (impossible from the deployed app; that's what Lovable itself is for)

## Confirm

Reply "go" and I ship Turn 1 in the next message. For Turn 3 and Turn 4, tell me when you have the Google credentials / Telegram bot token ready and I'll continue.
