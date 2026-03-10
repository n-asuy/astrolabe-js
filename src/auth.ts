import type { Context } from "hono";
import type { AuthenticatedUser, Env } from "./types";
import { internal, unauthorized } from "./error";

export async function requireUser(c: Context<Env>): Promise<AuthenticatedUser> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Missing or invalid Authorization header");
  }
  const token = header.slice(7);

  const supabaseUrl = c.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw internal("Missing env var: SUPABASE_URL");
  }

  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
    },
  });

  if (resp.status === 401) {
    throw unauthorized("Invalid or expired token");
  }

  if (resp.status >= 400) {
    const txt = await resp.text();
    throw internal(`Supabase auth error: ${resp.status} ${txt}`);
  }

  const user = (await resp.json()) as { id: string };
  return { userId: user.id };
}
