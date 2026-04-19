"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Voice = {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string;
};

export function VoicePanel({
  projectId,
  initialVoiceId,
  initialVoiceName,
}: {
  projectId: string;
  initialVoiceId: string | null;
  initialVoiceName: string | null;
}) {
  const router = useRouter();
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [configured, setConfigured] = useState<boolean>(true);
  const [selected, setSelected] = useState<string>(initialVoiceId ?? "");
  const [selectedName, setSelectedName] = useState<string | null>(initialVoiceName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/voices");
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error ?? "failed");
        setVoices(j.voices ?? []);
        setConfigured(j.configured ?? false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function preview(voice: Voice) {
    if (!voice.preview_url) return;
    if (audioRef.current) audioRef.current.pause();
    const a = new Audio(voice.preview_url);
    audioRef.current = a;
    void a.play().catch(() => {});
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const chosen = voices?.find((v) => v.voice_id === selected);
      const voiceName = chosen?.name ?? null;

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: selected || null,
          voice_name: voiceName,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "save failed");
      setSelectedName(voiceName);

      // Best-effort: push the new voice into the live Vapi assistant so
      // subsequent calls use it immediately. Ignore failure (no Vapi key
      // configured yet, etc).
      fetch("/api/vapi/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      }).catch(() => {});

      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setSaving(false);
    }
  }

  const currentSelection =
    voices?.find((v) => v.voice_id === selected) ?? null;

  return (
    <section className="mt-12">
      <h2 className="text-sm font-medium text-neutral-400">Interviewer voice</h2>

      {!configured && (
        <p className="mt-3 rounded-md border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          Set <code className="rounded bg-black/30 px-1">ELEVENLABS_API_KEY</code> in your env to list
          your voice library. Without it, Vapi will use its bundled default voice.
        </p>
      )}

      {configured && (
        <div className="mt-3 rounded-md border border-neutral-800 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr,auto,auto] sm:items-center">
            <select
              className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={voices === null}
            >
              <option value="">
                {voices === null ? "Loading voices..." : "Use Vapi default"}
              </option>
              {(voices ?? []).map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                  {v.category ? ` · ${v.category}` : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => currentSelection && preview(currentSelection)}
              disabled={!currentSelection?.preview_url}
              className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-200 disabled:opacity-40"
            >
              Preview
            </button>

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save voice"}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
            <span>
              {selectedName
                ? <>Current: <span className="text-neutral-300">{selectedName}</span></>
                : <>No voice selected — using Vapi default.</>}
            </span>
            {saved && <span className="text-emerald-400">Saved. Next call will use this voice.</span>}
            {error && <span className="text-red-400">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
