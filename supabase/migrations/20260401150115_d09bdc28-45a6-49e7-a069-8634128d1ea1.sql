-- Enable RLS on the profiles_public view
ALTER VIEW public.profiles_public SET (security_invoker = on);

-- Drop existing policies if any
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles_public;

-- Since profiles_public is a view with security_invoker=on, it will use
-- the calling user's permissions on the underlying profiles table.
-- The profiles table already has proper RLS policies restricting access.
-- This ensures the view inherits those restrictions.