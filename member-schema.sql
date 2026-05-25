-- ============================================================
-- Member dashboard schema for Lunchers Club
-- Run in Supabase SQL Editor AFTER the onboarding schema
-- ============================================================

-- 1. Member availability (days they're free for lunch)
CREATE TABLE IF NOT EXISTS member_availability (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID NOT NULL REFERENCES applications(id),
  available_date DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, available_date)
);

ALTER TABLE member_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_availability" ON member_availability
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Member preferences (lunch radius, location)
CREATE TABLE IF NOT EXISTS member_preferences (
  member_id      UUID PRIMARY KEY REFERENCES applications(id),
  lunch_radius   NUMERIC NOT NULL DEFAULT 2,
  lat            NUMERIC DEFAULT 48.8566,
  lng            NUMERIC DEFAULT 2.3522,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE member_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_preferences" ON member_preferences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Update verify_member_login: allow onboarded members too
CREATE OR REPLACE FUNCTION verify_member_login(p_ref_code TEXT, p_temp_password TEXT)
RETURNS JSON AS $$
DECLARE
  app RECORD;
BEGIN
  SELECT id, first_name, last_name, status, temp_password, onboarded
  INTO app
  FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code)) AND status = 'accepted';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF app.temp_password IS NULL OR app.temp_password != LOWER(TRIM(p_temp_password)) THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_password');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'member_id', app.id,
    'first_name', app.first_name,
    'last_name', app.last_name,
    'onboarded', app.onboarded
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update save_onboarding: keep temp_password for dashboard access
CREATE OR REPLACE FUNCTION save_onboarding(
  p_ref_code TEXT,
  p_temp_password TEXT,
  p_seeking TEXT[],
  p_connection_style TEXT[],
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

  -- Mark onboarded but KEEP temp_password for dashboard login
  UPDATE applications SET onboarded = true WHERE id = app.id;

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Get member dashboard data
CREATE OR REPLACE FUNCTION get_member_dashboard(p_ref_code TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  mem RECORD;
  lunch_count INT;
  people_met INT;
  month_lunches INT;
  plan_key TEXT;
  profile_row RECORD;
BEGIN
  SELECT id, first_name, last_name, status, decided_at, city,
         profession, employer, email, phone, country_code, ref_code,
         dob_day, dob_month, dob_year, linkedin, instagram
  INTO mem FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code)) AND status = 'accepted'
    AND temp_password = LOWER(TRIM(p_password)) AND onboarded;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT COUNT(*) INTO lunch_count
  FROM lunch_attendees WHERE member_id = mem.id;

  SELECT COUNT(DISTINCT la2.member_id) INTO people_met
  FROM lunch_attendees la
  JOIN lunch_attendees la2 ON la2.lunch_id = la.lunch_id AND la2.member_id != mem.id
  WHERE la.member_id = mem.id;

  SELECT COUNT(*) INTO month_lunches
  FROM lunch_attendees la JOIN lunches l ON l.id = la.lunch_id
  WHERE la.member_id = mem.id
    AND date_trunc('month', l.date) = date_trunc('month', CURRENT_DATE);

  SELECT COALESCE(mp.plan_key, 'standard') INTO plan_key
  FROM member_plans mp WHERE mp.member_id = mem.id;
  IF plan_key IS NULL THEN plan_key := 'standard'; END IF;

  RETURN json_build_object(
    'ok', true,
    'member', json_build_object(
      'id', mem.id, 'firstName', mem.first_name, 'lastName', mem.last_name,
      'joinedAt', mem.decided_at, 'city', mem.city, 'refCode', mem.ref_code,
      'profession', mem.profession, 'employer', mem.employer,
      'email', mem.email, 'phone', mem.phone, 'countryCode', mem.country_code,
      'dobDay', mem.dob_day, 'dobMonth', mem.dob_month, 'dobYear', mem.dob_year,
      'linkedin', mem.linkedin, 'instagram', mem.instagram,
      'plan', plan_key
    ),
    'stats', json_build_object(
      'lunchesAttended', lunch_count,
      'peopleMet', people_met,
      'monthLunches', month_lunches,
      'monthLimit', 4
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Get member's connections (people met at lunches)
CREATE OR REPLACE FUNCTION get_member_connections(p_ref_code TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  mem_id UUID;
BEGIN
  SELECT id INTO mem_id FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code)) AND status = 'accepted'
    AND temp_password = LOWER(TRIM(p_password)) AND onboarded;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  RETURN json_build_object('ok', true, 'connections', (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
      SELECT DISTINCT ON (a.id)
        a.id, a.first_name AS "firstName", a.last_name AS "lastName",
        a.profession, a.employer, a.city,
        l.date AS "lunchDate", l.restaurant, l.neighborhood
      FROM lunch_attendees la
      JOIN lunch_attendees la2 ON la2.lunch_id = la.lunch_id AND la2.member_id != mem_id
      JOIN applications a ON a.id = la2.member_id
      JOIN lunches l ON l.id = la.lunch_id
      WHERE la.member_id = mem_id
      ORDER BY a.id, l.date DESC
    ) t
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Get member availability
CREATE OR REPLACE FUNCTION get_member_availability(p_ref_code TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  mem_id UUID;
BEGIN
  SELECT id INTO mem_id FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code)) AND status = 'accepted'
    AND temp_password = LOWER(TRIM(p_password)) AND onboarded;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  RETURN json_build_object('ok', true, 'dates', (
    SELECT COALESCE(json_agg(available_date), '[]'::json)
    FROM member_availability
    WHERE member_id = mem_id AND available_date >= CURRENT_DATE
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Toggle member availability for a date
CREATE OR REPLACE FUNCTION toggle_member_availability(
  p_ref_code TEXT, p_password TEXT, p_date DATE
) RETURNS JSON AS $$
DECLARE
  mem_id UUID;
  month_count INT;
  existing BOOLEAN;
BEGIN
  SELECT id INTO mem_id FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code)) AND status = 'accepted'
    AND temp_password = LOWER(TRIM(p_password)) AND onboarded;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  -- Check if already set
  SELECT EXISTS(
    SELECT 1 FROM member_availability
    WHERE member_id = mem_id AND available_date = p_date
  ) INTO existing;

  IF existing THEN
    DELETE FROM member_availability WHERE member_id = mem_id AND available_date = p_date;
    RETURN json_build_object('ok', true, 'action', 'removed');
  END IF;

  -- Check month limit (4 per calendar month)
  SELECT COUNT(*) INTO month_count
  FROM member_availability
  WHERE member_id = mem_id
    AND date_trunc('month', available_date) = date_trunc('month', p_date);

  IF month_count >= 4 THEN
    RETURN json_build_object('ok', false, 'error', 'month_limit');
  END IF;

  INSERT INTO member_availability (member_id, available_date) VALUES (mem_id, p_date);
  RETURN json_build_object('ok', true, 'action', 'added');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Get/set member preferences (location + radius)
CREATE OR REPLACE FUNCTION get_member_preferences(p_ref_code TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  mem_id UUID;
  prefs RECORD;
BEGIN
  SELECT id INTO mem_id FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code)) AND status = 'accepted'
    AND temp_password = LOWER(TRIM(p_password)) AND onboarded;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT * INTO prefs FROM member_preferences WHERE member_id = mem_id;

  IF NOT FOUND THEN
    INSERT INTO member_preferences (member_id) VALUES (mem_id) RETURNING * INTO prefs;
  END IF;

  RETURN json_build_object('ok', true, 'prefs', json_build_object(
    'radius', prefs.lunch_radius, 'lat', prefs.lat, 'lng', prefs.lng
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_member_preferences(
  p_ref_code TEXT, p_password TEXT,
  p_radius NUMERIC, p_lat NUMERIC, p_lng NUMERIC
) RETURNS JSON AS $$
DECLARE
  mem_id UUID;
BEGIN
  SELECT id INTO mem_id FROM applications
  WHERE ref_code = UPPER(TRIM(p_ref_code)) AND status = 'accepted'
    AND temp_password = LOWER(TRIM(p_password)) AND onboarded;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid');
  END IF;

  INSERT INTO member_preferences (member_id, lunch_radius, lat, lng)
  VALUES (mem_id, p_radius, p_lat, p_lng)
  ON CONFLICT (member_id)
  DO UPDATE SET lunch_radius = p_radius, lat = p_lat, lng = p_lng, updated_at = now();

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
