import { notFound } from "next/navigation";
import { healthReport, type ReportRow, type RowStatus } from "@/lib/health";

export const dynamic = "force-dynamic";

// Pre-configuration sanity check. Deliberately public so the researcher
// can hit it before any Supabase user exists. Never renders key values —
// only boolean presence + service reachability. Hide in prod with
// DEBUG_DISABLED=true once setup is stable.
export default async function DebugPage() {
  if (process.env.DEBUG_DISABLED === "true") return notFound();

  const report = await healthReport();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-xs uppercase tracking-widest text-neutral-500">Palate</p>
      <h1 className="mt-2 text-3xl font-semibold">Pre-flight check</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Shows which services are wired up. Hit this page before configuring
        Supabase / Anthropic / Vapi so you can see exactly which env vars
        are missing and which keys fail to authenticate. No secret values
        are ever rendered.
      </p>

      <div className="mt-4 flex items-center gap-3 text-sm">
        <StatusDot status={report.overall} />
        <span className="text-neutral-300">
          Overall: <span className="font-medium">{overallLabel(report.overall)}</span>
        </span>
      </div>

      <section className="mt-8 overflow-hidden rounded-md border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900/50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Check</th>
              <th className="px-4 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {report.rows.map((row) => (
              <Row key={row.name} row={row} />
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-6 text-xs text-neutral-500">
        Once everything is green (or warnings are intentional), set{" "}
        <code className="rounded bg-black/30 px-1">DEBUG_DISABLED=true</code>{" "}
        in your env to hide this page.
      </p>
    </main>
  );
}

function Row({ row }: { row: ReportRow }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <StatusDot status={row.status} />
      </td>
      <td className="px-4 py-3 font-mono text-xs text-neutral-200">{row.name}</td>
      <td className="px-4 py-3 text-neutral-300">
        {row.detail}
        {row.remediation && (
          <div className="mt-1 text-xs text-neutral-500">→ {row.remediation}</div>
        )}
      </td>
    </tr>
  );
}

function StatusDot({ status }: { status: RowStatus }) {
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "warn"
      ? "bg-amber-500"
      : status === "missing"
      ? "bg-neutral-500"
      : "bg-red-500";
  const label =
    status === "ok" ? "ok"
    : status === "warn" ? "warn"
    : status === "missing" ? "not set"
    : "error";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-label={label} />
      <span className="text-xs text-neutral-500">{label}</span>
    </span>
  );
}

function overallLabel(status: RowStatus): string {
  switch (status) {
    case "ok": return "ready to go";
    case "warn": return "partially configured (some optional services off)";
    case "missing": return "required config missing";
    case "error": return "something is broken — see rows below";
  }
}
