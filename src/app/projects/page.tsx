import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/projects");

  const { data: projects } = await sb
    .from("projects")
    .select("id, name, topic, client, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-500">Palate</p>
          <h1 className="mt-2 text-3xl font-semibold">Projects</h1>
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            Sign out ({user.email})
          </button>
        </form>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-neutral-400">New project</h2>
        <NewProjectForm />
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-medium text-neutral-400">Existing</h2>
        <ul className="mt-3 divide-y divide-neutral-800 rounded-md border border-neutral-800">
          {(projects ?? []).map((p) => (
            <li key={p.id} className="px-4 py-3 hover:bg-neutral-900/40">
              <Link href={`/projects/${p.id}`} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.topic && <div className="text-sm text-neutral-400">{p.topic}</div>}
                </div>
                <span className="text-xs text-neutral-500">{p.status}</span>
              </Link>
            </li>
          ))}
          {(!projects || projects.length === 0) && (
            <li className="px-4 py-6 text-sm text-neutral-500">No projects yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
