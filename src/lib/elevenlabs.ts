import { env } from "./env";

const BASE = "https://api.elevenlabs.io/v1";

export type Voice = {
  voice_id: string;
  name: string;
  category?: string;          // "premade" | "cloned" | "professional" | etc
  labels?: Record<string, string>;
  preview_url?: string;       // short MP3 sample
};

// Thin wrapper around the ElevenLabs voices endpoint. Returns an empty list
// (not an error) when the API key isn't configured so the UI can render a
// friendly "add key" state.
export async function listVoices(): Promise<{ voices: Voice[]; configured: boolean }> {
  const key = env().ELEVENLABS_API_KEY;
  if (!key) return { voices: [], configured: false };

  const res = await fetch(`${BASE}/voices`, {
    headers: { "xi-api-key": key },
    // ElevenLabs voices list is stable; cache briefly to avoid hammering on
    // every page load.
    next: { revalidate: 120 },
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs /voices failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { voices: Voice[] };
  return { voices: json.voices, configured: true };
}
