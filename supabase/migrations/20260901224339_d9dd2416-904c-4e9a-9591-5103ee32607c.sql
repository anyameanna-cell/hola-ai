
CREATE TABLE public.manager_staff (
  email text PRIMARY KEY,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.manager_staff TO authenticated;
GRANT ALL ON public.manager_staff TO service_role;

ALTER TABLE public.manager_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_manager_staff(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.manager_staff WHERE lower(email) = lower(_email))
$$;

CREATE POLICY "Staff can view the staff list"
ON public.manager_staff FOR SELECT TO authenticated
USING (public.is_manager_staff(auth.jwt() ->> 'email'));

CREATE POLICY "Staff can add staff"
ON public.manager_staff FOR INSERT TO authenticated
WITH CHECK (public.is_manager_staff(auth.jwt() ->> 'email'));

INSERT INTO public.manager_staff (email) VALUES
  ('anyame.anna@gmail.com'),
  ('adbenza.zp@gmail.com'),
  ('anya.cutsy@gmail.com')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS broadcast boolean NOT NULL DEFAULT false;

CREATE TABLE public.code_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  content text NOT NULL,
  note text,
  author_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX code_drafts_path_key ON public.code_drafts (path);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_drafts TO authenticated;
GRANT ALL ON public.code_drafts TO service_role;

ALTER TABLE public.code_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage code drafts"
ON public.code_drafts FOR ALL TO authenticated
USING (public.is_manager_staff(auth.jwt() ->> 'email'))
WITH CHECK (public.is_manager_staff(auth.jwt() ->> 'email'));
