import { createClient } from '@supabase/supabase-js';

// Support VITE_ environment variables for deployment flexibility
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bdfgscjiuqccoidkeaqh.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZmdzY2ppdXFjY29pZGtlYXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MDc0ODgsImV4cCI6MjEwNzk4MzQ4OH0.CP8Cb8ZYRdvtV4Cs4PEe6XnA9S3rrv3O6LLbnTh2T2U';

// Client-side instance using the public anon key
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
