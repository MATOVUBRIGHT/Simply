-- Each user account is its own school tenant: school_id must match id (no random default tenant).
CREATE OR REPLACE FUNCTION public.users_set_school_id_to_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.school_id := NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_school_id_to_user_id ON public.users;
CREATE TRIGGER trg_users_school_id_to_user_id
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_set_school_id_to_user_id();
