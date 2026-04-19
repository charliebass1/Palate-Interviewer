"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, topic: topic || undefined, client: client || undefined }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(typeof j.error === "string" ? j.error : "Failed to create");
      }
      setName(""); setTopic(""); setClient("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-md border border-neutral-800 p-4 sm:grid-cols-3">
      <input
        className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none ring-0 focus:bg-neutral-800"
        placeholder="Project name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
        placeholder="Topic (optional)"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <input
        className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
        placeholder="Client (optional)"
        value={client}
        onChange={(e) => setClient(e.target.value)}
      />
      <div className="sm:col-span-3 flex items-center justify-between">
        {error && <span className="text-sm text-red-400">{error}</span>}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="ml-auto rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Creating..." : "Create project"}
        </button>
      </div>
    </form>
  );
}
