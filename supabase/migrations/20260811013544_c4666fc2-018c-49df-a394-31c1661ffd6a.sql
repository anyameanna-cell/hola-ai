-- 1. app_user_connections: owner-scoped access WITHOUT exposing the ciphertext column.
-- Column-level grants keep connection_key_ciphertext unreadable by app users;
-- only service_role (server-side code) can read/write it.
REVOKE ALL ON public.app_user_connections FROM authenticated;
GRANT SELECT (id, user_id, connector_id, created_at, updated_at) ON public.app_user_connections TO authenticated;
GRANT DELETE ON public.app_user_connections TO authenticated;
GRANT ALL ON public.app_user_connections TO service_role;

CREATE POLICY "own connections read"
  ON public.app_user_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own connections delete"
  ON public.app_user_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 2. notifications: allow users to delete their own notifications.
GRANT DELETE ON public.notifications TO authenticated;

CREATE POLICY "own notifications delete"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3. telegram_links: allow user-initiated linking, strictly scoped to self.
GRANT INSERT ON public.telegram_links TO authenticated;

CREATE POLICY "own telegram link insert"
  ON public.telegram_links FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);