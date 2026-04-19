import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect(sp.next ?? "/projects");

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <p className="text-xs uppercase tracking-widest text-neutral-500">Palate</p>
      <h1 className="mt-3 text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-400">
        We&apos;ll email you a one-time link. No password.
      </p>
      {sp.error && (
        <p className="mt-4 rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {sp.error}
        </p>
      )}
      <LoginForm next={sp.next} />
    </main>
  );
}
