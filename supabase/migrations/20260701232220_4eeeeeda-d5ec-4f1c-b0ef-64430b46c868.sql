
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS message_length text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS behavior text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS tts_voice text NOT NULL DEFAULT 'shimmer',
  ADD COLUMN IF NOT EXISTS tts_speed real NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS tts_volume real NOT NULL DEFAULT 1.0;
