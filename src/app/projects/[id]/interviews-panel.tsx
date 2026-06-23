"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Interview = {
  id: string;
  expert_name: string;
  expert_role: string | null;
  expert_segment: string | null;
  status: "scheduled" | "in_progress" | "completed" | "failed" | "cancelled";
  scheduled_at: string | null;
  duration_sec: number | null;
  vapi_call_id: string | null;
};

export function InterviewsPanel({
  projectId,
  guideId,
  initial,
  mockMode = false,
}: {
  projectId: string;
  guideId: string | null;
  initial: Interview[];
  mockMode?: boolean;
}) {
  const router = useRouter();
  const [expertName, setExpertName] = useState("");
  const [expertRole, setExpertRole] = useState("");
  const [segment, setSegment] = useState("");
  const [phone, setPhone] = useState("");
  // In mock mode, default to simulating the call so the demo flows in one click.
  const [dialNow, setDialNow] = useState(mockMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          guide_id: guideId ?? undefined,
          expert_name: expertName,
          expert_role: expertRole || undefined,
          expert_segment: segment || undefined,
          expert_phone: dialNow ? phone : undefined,
          dial_now: dialNow,
        }),
      });
      const j = await res.json();
      if (!res.ok && !j.interview) {
        throw new Error(typeof j.error === "string" ? j.error : "create failed");
      }
      if (j.warning) setError(j.warning);
      setExpertName(""); setExpertRole(""); setSegment(""); setPhone("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="text-sm font-medium text-neutral-400">Interviews</h2>

      <form onSubmit={submit} className="mt-3 grid gap-3 rounded-md border border-neutral-800 p-4 sm:grid-cols-2">
        <input
          className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
          placeholder="Expert name"
          required
          value={expertName}
          onChange={(e) => setExpertName(e.target.value)}
        />
        <input
          className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
          placeholder="Role (e.g. Director of Culinary)"
          value={expertRole}
          onChange={(e) => setExpertRole(e.target.value)}
        />
        <select
          className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
        >
          <option value="">Segment (optional)</option>
          <option value="operator">Operator</option>
          <option value="distributor">Distributor</option>
          <option value="broker">Broker</option>
          <option value="chef">Chef</option>
          <option value="procurement">Procurement</option>
          <option value="category_manager">Category manager</option>
        </select>
        {!mockMode && (
          <input
            className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800 disabled:opacity-50"
            placeholder="+14155551234 — include country code"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!dialNow}
          />
        )}
        <label className="flex items-center gap-2 text-xs text-neutral-400 sm:col-span-2">
          <input
            type="checkbox"
            checked={dialNow}
            onChange={(e) => setDialNow(e.target.checked)}
          />
          {mockMode
            ? "Simulate the call now & generate a summary (demo — no phone needed)"
            : "Dial now via Vapi (requires VAPI_ASSISTANT_ID + VAPI_PHONE_NUMBER_ID)"}
        </label>
        <div className="sm:col-span-2 flex items-center justify-between">
          {error && <span className="text-xs text-amber-400">{error}</span>}
          <button
            type="submit"
            disabled={busy || !expertName.trim() || (dialNow && !phone.trim() && !mockMode)}
            className="ml-auto rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy
              ? mockMode && dialNow
                ? "Simulating call..."
                : dialNow
                ? "Dialing..."
                : "Saving..."
              : mockMode && dialNow
              ? "Schedule & simulate call"
              : dialNow
              ? "Schedule & dial"
              : "Schedule"}
          </button>
        </div>
      </form>

      <ul className="mt-4 divide-y divide-neutral-800 rounded-md border border-neutral-800">
        {initial.map((i) => (
          <li key={i.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-medium">{i.expert_name}</div>
              <div className="text-xs text-neutral-500">
                {i.expert_role ?? "—"}
                {i.expert_segment && ` · ${i.expert_segment}`}
                {i.duration_sec ? ` · ${Math.round(i.duration_sec / 60)} min` : ""}
              </div>
            </div>
            <span className={badge(i.status)}>{i.status.replace("_", " ")}</span>
          </li>
        ))}
        {initial.length === 0 && (
          <li className="px-4 py-6 text-sm text-neutral-500">No interviews yet.</li>
        )}
      </ul>
    </section>
  );
}

function badge(status: Interview["status"]) {
  const base = "rounded px-2 py-0.5 text-xs capitalize";
  switch (status) {
    case "completed":   return `${base} bg-emerald-900/40 text-emerald-300`;
    case "in_progress": return `${base} bg-amber-900/40 text-amber-300`;
    case "failed":      return `${base} bg-red-900/40 text-red-300`;
    case "cancelled":   return `${base} bg-neutral-900 text-neutral-400`;
    default:            return `${base} bg-neutral-800 text-neutral-300`;
  }
}
