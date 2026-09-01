
REVOKE EXECUTE ON FUNCTION public.is_manager_staff(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager_staff(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_manager_staff(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_staff(text) TO service_role;
