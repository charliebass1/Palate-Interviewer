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

// Request options shared across the app.
//
// Default model is Haiku 4.5 — fast and cheap, no effort/adaptive-thinking.
// If the caller upgrades ANTHROPIC_MODEL to sonnet-4-6 / opus-4-6 / opus-4-7,
// uncomment the enrichments below (they will error on Haiku 4.5):
//   thinking: { type: "adaptive", display: "summarized" },
//   output_config: { effort: "high" },
export const BASE_REQUEST = {} as const;
