-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('hr', 'incharge', 'employee', 'student');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "hr read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hr'));

-- 2. Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  department text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "hr read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hr'));

CREATE OR REPLACE FUNCTION public.my_department()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department FROM public.profiles WHERE id = auth.uid()
$$;

-- 3. Employees: photo + self-login link
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE POLICY "hr role manage employees" ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr')) WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "incharge read dept employees" ON public.employees FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'incharge') AND department IS NOT DISTINCT FROM public.my_department());
CREATE POLICY "employee read self" ON public.employees FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. Students
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid,
  student_code text NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  department text,
  class_name text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage students" ON public.students FOR ALL TO authenticated
  USING (auth.uid() = hr_id OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (auth.uid() = hr_id OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "incharge read dept students" ON public.students FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'incharge') AND department IS NOT DISTINCT FROM public.my_department());
CREATE POLICY "student read self" ON public.students FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 5. Attendance: snapshot photo + broader access
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS snapshot_url text;

CREATE POLICY "hr role manage attendance" ON public.attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr')) WITH CHECK (public.has_role(auth.uid(), 'hr'));
CREATE POLICY "incharge read dept attendance" ON public.attendance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'incharge') AND EXISTS (
    SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id
      AND e.department IS NOT DISTINCT FROM public.my_department()));
CREATE POLICY "employee read own attendance" ON public.attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "employee punch self" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id AND e.user_id = auth.uid()));

-- 6. Student attendance
CREATE TABLE public.student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  recorded_by uuid,
  punch_type text NOT NULL,
  punched_at timestamptz NOT NULL DEFAULT now(),
  snapshot_url text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_attendance TO authenticated;
GRANT ALL ON public.student_attendance TO service_role;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage student attendance" ON public.student_attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr') OR EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = student_attendance.student_id AND s.hr_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'hr') OR EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = student_attendance.student_id AND s.hr_id = auth.uid()));
CREATE POLICY "incharge read dept student attendance" ON public.student_attendance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'incharge') AND EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = student_attendance.student_id
      AND s.department IS NOT DISTINCT FROM public.my_department()));
CREATE POLICY "student read own attendance" ON public.student_attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_attendance.student_id AND s.user_id = auth.uid()));
CREATE POLICY "student punch self" ON public.student_attendance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_attendance.student_id AND s.user_id = auth.uid()));
CREATE POLICY "incharge record dept student attendance" ON public.student_attendance FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'incharge') AND EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = student_attendance.student_id
      AND s.department IS NOT DISTINCT FROM public.my_department()));
CREATE POLICY "incharge record dept attendance" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'incharge') AND EXISTS (
    SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id
      AND e.department IS NOT DISTINCT FROM public.my_department()));

-- 7. Self-service role claim / account linking
CREATE OR REPLACE FUNCTION public.claim_role(_role public.app_role, _full_name text, _department text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _matched uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  INSERT INTO public.profiles (id, full_name, email, department)
  VALUES (_uid, _full_name, _email, _department)
  ON CONFLICT (id) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
                                 department = COALESCE(EXCLUDED.department, public.profiles.department),
                                 email = EXCLUDED.email;

  IF _role = 'employee' THEN
    SELECT id INTO _matched FROM public.employees WHERE lower(email) = lower(_email) LIMIT 1;
    IF _matched IS NULL THEN RAISE EXCEPTION 'No employee record found for %. Ask HR to add you first.', _email; END IF;
    UPDATE public.employees SET user_id = _uid WHERE id = _matched;
  ELSIF _role = 'student' THEN
    SELECT id INTO _matched FROM public.students WHERE lower(email) = lower(_email) LIMIT 1;
    IF _matched IS NULL THEN RAISE EXCEPTION 'No student record found for %. Ask HR to add you first.', _email; END IF;
    UPDATE public.students SET user_id = _uid WHERE id = _matched;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role) ON CONFLICT DO NOTHING;
  RETURN _role::text;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_role(public.app_role, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_role(public.app_role, text, text) TO authenticated;

-- 8. Realtime
ALTER TABLE public.attendance REPLICA IDENTITY FULL;
ALTER TABLE public.student_attendance REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_attendance;
