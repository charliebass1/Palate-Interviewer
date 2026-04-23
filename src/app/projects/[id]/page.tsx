import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { MaterialsPanel } from "./materials-panel";
import { GuidePanel } from "./guide-panel";
import { InterviewsPanel } from "./interviews-panel";
import { SummariesPanel } from "./summaries-panel";
import { ThemesPanel } from "./themes-panel";
import { VoicePanel } from "./voice-panel";
import { DevTranscriptPanel } from "./dev-transcript-panel";
import { WorkflowChecklist } from "./workflow-checklist";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: project } = await sb
    .from("projects")
    .select("id, name, topic, client, status, voice_id, voice_name, created_at")
    .eq("id", id)
    .single();
  if (!project) return notFound();

  const [
    { data: materials },
    { data: guides },
    { data: interviews },
    { data: summaries },
    { data: themes },
  ] = await Promise.all([
    sb.from("materials")
      .select("id, filename, parse_status, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    sb.from("interview_guides")
      .select("id, version, objective, guide_json, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    sb.from("interviews")
      .select("id, expert_name, expert_role, expert_segment, status, scheduled_at, duration_sec, vapi_call_id")
      .eq("project_id", id)
      .order("scheduled_at", { ascending: false, nullsFirst: false }),
    sb.from("summaries")
      .select("id, interview_id, insights, quotes, sentiment, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    sb.from("themes")
      .select("id, title, description, supporting_quotes, confidence, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const latestGuide = guides?.[0] ?? null;
  const hasParsedMaterial = (materials ?? []).some((m) => m.parse_status === "parsed");
  const hasCompletedInterview = (interviews ?? []).some((i) => i.status === "completed");
  const hasThemes = (themes ?? []).length > 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/projects" className="text-xs text-neutral-500 hover:text-neutral-300">← All projects</Link>
      <h1 className="mt-3 text-3xl font-semibold">{project.name}</h1>
      {project.topic && <p className="mt-1 text-neutral-400">{project.topic}</p>}

      <WorkflowChecklist
        hasParsedMaterial={hasParsedMaterial}
        hasGuide={Boolean(latestGuide)}
        hasCompletedInterview={hasCompletedInterview}
        hasThemes={hasThemes}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <MaterialsPanel projectId={project.id} initial={materials ?? []} />
        <GuidePanel
          projectId={project.id}
          initialGuide={latestGuide}
          hasParsedMaterial={hasParsedMaterial}
        />
      </div>

      <VoicePanel
        projectId={project.id}
        initialVoiceId={project.voice_id ?? null}
        initialVoiceName={project.voice_name ?? null}
      />

      <InterviewsPanel
        projectId={project.id}
        guideId={latestGuide?.id ?? null}
        initial={interviews ?? []}
      />

      {process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true" && (
        <DevTranscriptPanel projectId={project.id} guideId={latestGuide?.id ?? null} />
      )}

      <SummariesPanel
        summaries={(summaries as Parameters<typeof SummariesPanel>[0]["summaries"]) ?? []}
        interviews={(interviews ?? []).map((i) => ({
          id: i.id, expert_name: i.expert_name, expert_role: i.expert_role,
        }))}
      />

      <ThemesPanel
        projectId={project.id}
        initial={(themes as Parameters<typeof ThemesPanel>[0]["initial"]) ?? []}
        canSynthesize={(summaries?.length ?? 0) >= 1}
      />
    </main>
  );
}
