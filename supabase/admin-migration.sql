-- Admin support migration
-- Run this in the Supabase SQL editor after the initial schema

-- Add is_admin column to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Helper function to check admin status without triggering RLS recursion on users table.
-- SECURITY DEFINER + SET search_path ensures this runs as the function owner (postgres)
-- and bypasses RLS on the users table, breaking the recursive policy cycle.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Admin policies for topics (full CRUD) — use is_admin() to avoid RLS recursion
CREATE POLICY "Admins can update any topic" ON public.topics
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete topics" ON public.topics
  FOR DELETE USING (public.is_admin());

-- Admin policies for arguments (full CRUD)
CREATE POLICY "Admins can update arguments" ON public.arguments
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete arguments" ON public.arguments
  FOR DELETE USING (public.is_admin());

CREATE POLICY "Admins can insert arguments" ON public.arguments
  FOR INSERT WITH CHECK (public.is_admin());

-- Admin policies for conversations
CREATE POLICY "Admins can update any conversation" ON public.conversations
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete conversations" ON public.conversations
  FOR DELETE USING (public.is_admin());

-- Admin can read all user records (uses security definer function to avoid infinite recursion)
CREATE POLICY "Admins can read all users" ON public.users
  FOR SELECT USING (public.is_admin());

-- To make a user admin, run:
-- UPDATE public.users SET is_admin = true WHERE email = 'your@email.com';
