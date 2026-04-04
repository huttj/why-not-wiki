-- Fix RLS infinite recursion on users table
-- Run this in the Supabase SQL editor to fix the existing database
--
-- Problem: Admin policies on topics/arguments/conversations used inline
-- subqueries (SELECT FROM users) which triggered RLS evaluation on the
-- users table, causing infinite recursion. The fix uses a SECURITY DEFINER
-- function that bypasses RLS when checking admin status.

-- 1. Recreate is_admin() with SET search_path to ensure RLS bypass works
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 2. Drop and recreate admin policies on topics to use is_admin()
DROP POLICY IF EXISTS "Admins can update any topic" ON public.topics;
CREATE POLICY "Admins can update any topic" ON public.topics
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete topics" ON public.topics;
CREATE POLICY "Admins can delete topics" ON public.topics
  FOR DELETE USING (public.is_admin());

-- 3. Drop and recreate admin policies on arguments to use is_admin()
DROP POLICY IF EXISTS "Admins can update arguments" ON public.arguments;
CREATE POLICY "Admins can update arguments" ON public.arguments
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete arguments" ON public.arguments;
CREATE POLICY "Admins can delete arguments" ON public.arguments
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert arguments" ON public.arguments;
CREATE POLICY "Admins can insert arguments" ON public.arguments
  FOR INSERT WITH CHECK (public.is_admin());

-- 4. Drop and recreate admin policies on conversations to use is_admin()
DROP POLICY IF EXISTS "Admins can update any conversation" ON public.conversations;
CREATE POLICY "Admins can update any conversation" ON public.conversations
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete conversations" ON public.conversations;
CREATE POLICY "Admins can delete conversations" ON public.conversations
  FOR DELETE USING (public.is_admin());

-- 5. Recreate admin read policy on users (already used is_admin() but refresh it)
DROP POLICY IF EXISTS "Admins can read all users" ON public.users;
CREATE POLICY "Admins can read all users" ON public.users
  FOR SELECT USING (public.is_admin());
