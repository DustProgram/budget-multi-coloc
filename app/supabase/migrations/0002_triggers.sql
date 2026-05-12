-- ============================================================
-- Triggers: auto-create charge_splits on charge insert
-- ============================================================

CREATE OR REPLACE FUNCTION create_charge_splits()
RETURNS TRIGGER AS $$
DECLARE
  member_ids  UUID[];
  member_id   UUID;
  n           INT;
  per_person  NUMERIC(12, 2);
BEGIN
  -- Only create splits for shared charges
  IF NOT NEW.shared THEN
    RETURN NEW;
  END IF;

  -- Get all account members
  SELECT ARRAY_AGG(user_id)
  INTO member_ids
  FROM account_members
  WHERE account_id = NEW.account_id;

  IF member_ids IS NULL OR ARRAY_LENGTH(member_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  n := ARRAY_LENGTH(member_ids, 1);

  IF NEW.split_mode = 'equal' THEN
    per_person := ROUND(NEW.total / n, 2);
    FOREACH member_id IN ARRAY member_ids LOOP
      INSERT INTO charge_splits (charge_id, user_id, amount)
      VALUES (NEW.id, member_id, per_person);
    END LOOP;
  END IF;

  -- percent / shares modes: splits are created manually by the client
  -- (charge_splits are inserted explicitly when split_mode != equal)

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER charge_splits_on_insert
  AFTER INSERT ON charges
  FOR EACH ROW
  EXECUTE FUNCTION create_charge_splits();

-- ============================================================
-- Trigger: mirror auth.users → public.users on signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, color, initial)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'color', 'terra'),
    COALESCE(NEW.raw_user_meta_data->>'initial', UPPER(LEFT(split_part(NEW.email, '@', 1), 1)))
  )
  ON CONFLICT (id) DO NOTHING;

  -- Auto-create perso space
  INSERT INTO public.spaces (user_id, kind, label)
  VALUES (NEW.id, 'perso', 'Personnel')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
