import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { MaterialsPanel } from "./materials-panel";
import { GuidePanel } from "./guide-panel";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: project } = await sb
    .from("projects")
    .select("id, name, topic, client, status, created_at")
    .eq("id", id)
    .single();
  if (!project) return notFound();

  const [{ data: materials }, { data: guides }, { data: interviews }] = await Promise.all([
    sb.from("materials")
      .select("id, filename, parse_status, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    sb.from("interview_guides")
      .select("id, version, objective, guide_json, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    sb.from("interviews")
      .select("id, expert_name, expert_role, status, scheduled_at")
      .eq("project_id", id)
      .order("scheduled_at", { ascending: false }),
  ]);

  const latestGuide = guides?.[0];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/projects" className="text-xs text-neutral-500 hover:text-neutral-300">← All projects</Link>
      <h1 className="mt-3 text-3xl font-semibold">{project.name}</h1>
      {project.topic && <p className="mt-1 text-neutral-400">{project.topic}</p>}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <MaterialsPanel projectId={project.id} initial={materials ?? []} />
        <GuidePanel projectId={project.id} initialGuide={latestGuide ?? null} />
      </div>

      <section className="mt-12">
        <h2 className="text-sm font-medium text-neutral-400">Interviews</h2>
        <ul className="mt-3 divide-y divide-neutral-800 rounded-md border border-neutral-800">
          {(interviews ?? []).map((i) => (
            <li key={i.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{i.expert_name}</div>
                <div className="text-xs text-neutral-500">{i.expert_role}</div>
              </div>
              <span className="text-xs text-neutral-500">{i.status}</span>
            </li>
          ))}
          {(!interviews || interviews.length === 0) && (
            <li className="px-4 py-6 text-sm text-neutral-500">No interviews scheduled yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
