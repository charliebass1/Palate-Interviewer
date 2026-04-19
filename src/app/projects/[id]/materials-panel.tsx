"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Material = {
  id: string;
  filename: string;
  parse_status: "pending" | "parsing" | "parsed" | "failed";
  created_at: string;
};

export function MaterialsPanel({ projectId, initial }: { projectId: string; initial: Material[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/materials/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "upload init failed");

      const uploadRes = await fetch(j.upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`upload failed: ${uploadRes.status}`);

      const parseRes = await fetch("/api/materials/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_id: j.material_id }),
      });
      if (!parseRes.ok) {
        const pj = await parseRes.json();
        throw new Error(typeof pj.error === "string" ? pj.error : "parse failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-medium text-neutral-400">Research materials</h2>
      <label className="mt-3 block rounded-md border border-dashed border-neutral-700 px-4 py-6 text-center text-sm text-neutral-400 hover:border-neutral-500 cursor-pointer">
        <input
          type="file"
          className="hidden"
          accept=".pdf,.txt,.md,.csv"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        {busy ? "Uploading & parsing..." : "Click to upload PDF, TXT, MD, or CSV"}
      </label>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <ul className="mt-4 divide-y divide-neutral-800 rounded-md border border-neutral-800">
        {initial.map((m) => (
          <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="truncate">{m.filename}</span>
            <span className={badge(m.parse_status)}>{m.parse_status}</span>
          </li>
        ))}
        {initial.length === 0 && (
          <li className="px-3 py-4 text-sm text-neutral-500">No materials yet.</li>
        )}
      </ul>
    </section>
  );
}

function badge(status: Material["parse_status"]) {
  const base = "rounded px-2 py-0.5 text-xs";
  switch (status) {
    case "parsed":   return `${base} bg-emerald-900/40 text-emerald-300`;
    case "parsing":  return `${base} bg-amber-900/40 text-amber-300`;
    case "failed":   return `${base} bg-red-900/40 text-red-300`;
    default:         return `${base} bg-neutral-800 text-neutral-300`;
  }
}
