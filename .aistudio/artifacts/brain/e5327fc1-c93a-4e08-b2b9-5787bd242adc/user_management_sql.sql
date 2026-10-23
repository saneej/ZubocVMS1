-- Create the staffs table to manage user roles
CREATE TABLE IF NOT EXISTS public.staffs (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CRE', 'DESIGNER', 'PRODUCTION', 'SUPERVISOR', 'PACKER')),
    station_id TEXT DEFAULT 'Packing-01',
    is_active BOOLEAN DEFAULT true,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.staffs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read staff profiles
CREATE POLICY "Allow authenticated read" ON public.staffs
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow admins to manage staff
CREATE POLICY "Allow admin management" ON public.staffs
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.staffs
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );
