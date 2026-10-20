import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Cliente de Supabase con la sesión del usuario (cookies), para Supabase Auth: entrar, salir, registrarse
 * y leer quién es. Uno nuevo por pedido, como pide @supabase/ssr. Las lecturas de datos van con service role
 * filtradas por la agencia del usuario (ver lib/session.ts).
 */
export async function supabaseUser() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error("Supabase Auth no está configurado (SUPABASE_URL y SUPABASE_ANON_KEY)");
  const jar = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies: el proxy refresca la sesión.
        }
      },
    },
  });
}
