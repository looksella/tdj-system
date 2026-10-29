/** Both public Supabase values are required for client-side authentication. */
export const LOGIN_ACTIVO = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
