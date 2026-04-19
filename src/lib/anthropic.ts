import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (client) return client;
  client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
  return client;
}

export function defaultModel(): string {
  return env().ANTHROPIC_MODEL;
}

// Standard request options used across the app.
// - Adaptive thinking (summarized so UI can show progress)
// - High effort by default; callers can override for subagents or cheap calls.
export const BASE_REQUEST = {
  thinking: { type: "adaptive" as const, display: "summarized" as const },
  output_config: { effort: "high" as const },
};
