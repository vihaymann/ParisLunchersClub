-- ============================================================
-- Onboarding schema for The Paris Lunchers Club
-- Run in Supabase SQL Editor AFTER the initial schema
-- ============================================================

-- 1. Add columns to applications for member login
ALTER TABLE applications ADD COLUMN IF NOT EXISTS temp_password TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;

-- 2. Generate temp password (8 chars, lowercase, no ambiguous chars)
CREATE OR REPLACE FUNCTION generate_temp_password()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
  pwd TEXT := '';
BEGIN
  FOR i IN 1..8 LOOP
    pwd := pwd || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN pwd;
END;
$$ LANGUAGE plpgsql;

-- 3. Auto-generate temp_password when status becomes 'accepted'
CREATE OR REPLACE FUNCTION on_application_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    NEW.temp_password := generate_temp_password();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_application_accepted
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION on_application_accepted();

-- 4. Onboarding profiles table
CREATE TABLE onboarding_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES applications(id) UNIQUE,

  -- Q1: seeking
  seeking          TEXT NOT NULL CHECK (seeking IN ('friend','professional','surprise')),
  -- Q2: connection style
  connection_style TEXT NOT NULL CHECK (connection_style IN ('mutual_friends','work_click','debate','laughter')),
  -- Q3: interests (multi-select tags)
  interests        TEXT[] NOT NULL DEFAULT '{}',
  -- Q4: table personality
  table_style      TEXT NOT NULL CHECK (table_style IN ('talker','balanced','listener')),
  -- Q5: job passion (free text 120 chars)
  job_passion      TEXT NOT NULL DEFAULT '',
  -- Q6: open to (multi-select tags)
  open_to          TEXT[] NOT NULL DEFAULT '{}',
  -- Q7: memorable lunch (free text 300 chars)
  memorable_lunch  TEXT NOT NULL DEFAULT '',
  -- Q8: hidden topic (free text 200 chars)
  hidden_topic     TEXT NOT NULL DEFAULT '',
  -- Q9: dream lunch guests
  dream_guest_1    TEXT NOT NULL DEFAULT '',
  dream_guest_2    TEXT NOT NULL DEFAULT '',
  dream_guest_3    TEXT NOT NULL DEFAULT '',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_onboarding_updated
  BEFORE UPDATE ON onboarding_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. RLS
ALTER TABLE onboarding_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_profiles" ON onboarding_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. RPC: Verify member login (anon-callable, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION verify_member_login(p_ref_code TEXT, p_temp_password TEXT)
RETURNS JSON AS $$
DECLARE
  app RECORD;
BEGIN
  SELECT id, first_name, status, temp_password, onboarded
  INTO app
  FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code)) AND status = 'accepted';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF app.temp_password IS NULL OR app.temp_password != LOWER(TRIM(p_temp_password)) THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_password');
  END IF;

  IF app.onboarded THEN
    RETURN json_build_object('ok', false, 'error', 'already_onboarded');
  END IF;

  RETURN json_build_object('ok', true, 'member_id', app.id, 'first_name', app.first_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Save onboarding profile (anon-callable, re-verifies creds)
CREATE OR REPLACE FUNCTION save_onboarding(
  p_ref_code TEXT,
  p_temp_password TEXT,
  p_seeking TEXT,
  p_connection_style TEXT,
  p_interests TEXT[],
  p_table_style TEXT,
  p_job_passion TEXT,
  p_open_to TEXT[],
  p_memorable_lunch TEXT,
  p_hidden_topic TEXT,
  p_dream_guest_1 TEXT,
  p_dream_guest_2 TEXT,
  p_dream_guest_3 TEXT
) RETURNS JSON AS $$
DECLARE
  app RECORD;
BEGIN
  SELECT id INTO app FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code))
    AND status = 'accepted'
    AND temp_password = LOWER(TRIM(p_temp_password))
    AND NOT onboarded;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  INSERT INTO onboarding_profiles (
    member_id, seeking, connection_style, interests, table_style,
    job_passion, open_to, memorable_lunch, hidden_topic,
    dream_guest_1, dream_guest_2, dream_guest_3
  ) VALUES (
    app.id, p_seeking, p_connection_style, p_interests, p_table_style,
    p_job_passion, p_open_to, p_memorable_lunch, p_hidden_topic,
    p_dream_guest_1, p_dream_guest_2, p_dream_guest_3
  );

  UPDATE applications SET onboarded = true, temp_password = NULL WHERE id = app.id;

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
