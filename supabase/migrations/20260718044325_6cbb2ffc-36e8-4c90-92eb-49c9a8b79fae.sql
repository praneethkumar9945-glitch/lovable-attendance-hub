
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hr_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  position TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hr_id, employee_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manage own employees" ON public.employees FOR ALL USING (auth.uid() = hr_id) WITH CHECK (auth.uid() = hr_id);

CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  hr_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  punch_type TEXT NOT NULL CHECK (punch_type IN ('in','out')),
  punched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manage own attendance" ON public.attendance FOR ALL USING (auth.uid() = hr_id) WITH CHECK (auth.uid() = hr_id);
CREATE INDEX idx_attendance_employee ON public.attendance(employee_id, punched_at DESC);
