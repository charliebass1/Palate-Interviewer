// Thin wrapper around the Vapi REST API. We only use three endpoints:
//   POST   /assistant         - create an assistant
//   PATCH  /assistant/{id}    - update an assistant
//   POST   /call              - create an outbound phone call
//
// Vapi's assistant object lets you bring your own model (Anthropic), STT
// (Deepgram), and TTS (ElevenLabs). The config we ship below plugs those in
// with Claude Haiku 4.5 as the interviewer brain.
//
// Reference: https://docs.vapi.ai

import { env } from "./env";
import { INTERVIEWER_SYSTEM } from "./prompts/interviewer";

const VAPI_BASE = "https://api.vapi.ai";

export type VapiAssistantConfig = {
  name: string;
  firstMessage: string;
  endCallPhrases?: string[];
  model: {
    provider: "anthropic";
    model: string;
    temperature?: number;
    maxTokens?: number;
    messages: { role: "system"; content: string }[];
  };
  voice?: {
    provider: "11labs" | "deepgram" | "playht";
    voiceId: string;
    model?: string;
  };
  transcriber?: {
    provider: "deepgram";
    model: string;
    language?: string;
  };
  serverUrl?: string;
  serverUrlSecret?: string;
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  recordingEnabled?: boolean;
};

type AssistantResponse = { id: string };
type CallResponse = { id: string; status?: string };

function apiKey(): string {
  const key = env().VAPI_API_KEY;
  if (!key) throw new Error("VAPI_API_KEY not configured");
  return key;
}

async function vapi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vapi ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

// Build the default Palate assistant config. Pass in a guide_json snapshot
// and the assistant's first message will prime Claude with that guide as
// context for the live call.
export function buildAssistantConfig(opts: {
  name?: string;
  guideJson?: object | null;
  model?: string;
  elevenLabsVoiceId?: string;
  appUrl: string;
  webhookSecret?: string;
}): VapiAssistantConfig {
  const model = opts.model ?? "claude-haiku-4-5";
  const guideBlock = opts.guideJson
    ? `\n\nYour interview guide for this call (JSON):\n${JSON.stringify(opts.guideJson)}\n`
    : "";

  return {
    name: opts.name ?? "Palate — Foodservice Interviewer",
    firstMessage:
      "Hi — thanks for making time today. I'm Palate, an AI research interviewer. Before we start, can I confirm you're OK with this call being recorded for our research notes?",
    endCallPhrases: ["goodbye", "have a good day", "thanks again"],
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 1900, // ~31.5 min hard ceiling
    recordingEnabled: true,
    model: {
      provider: "anthropic",
      model,
      temperature: 0.4,
      maxTokens: 600,
      messages: [{ role: "system", content: INTERVIEWER_SYSTEM + guideBlock }],
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "en",
    },
    voice: {
      provider: "11labs",
      voiceId: opts.elevenLabsVoiceId ?? "21m00Tcm4TlvDq8ikWAM", // Rachel — placeholder
      model: "eleven_turbo_v2_5",
    },
    serverUrl: `${opts.appUrl.replace(/\/$/, "")}/api/vapi/webhook`,
    serverUrlSecret: opts.webhookSecret,
  };
}

export async function createAssistant(cfg: VapiAssistantConfig): Promise<AssistantResponse> {
  return vapi<AssistantResponse>("POST", "/assistant", cfg);
}

export async function updateAssistant(
  id: string,
  cfg: Partial<VapiAssistantConfig>,
): Promise<AssistantResponse> {
  return vapi<AssistantResponse>("PATCH", `/assistant/${id}`, cfg);
}

// Starts an outbound phone call. `assistantId` pins the config; pass
// `assistantOverrides` to inject per-call context (the guide JSON, the
// expert's name, the study objective) into the system prompt.
export async function createOutboundCall(args: {
  assistantId: string;
  phoneNumberId: string;
  customerNumber: string;
  customerName?: string;
  assistantOverrides?: Partial<VapiAssistantConfig>;
  metadata?: Record<string, unknown>;
}): Promise<CallResponse> {
  return vapi<CallResponse>("POST", "/call", {
    assistantId: args.assistantId,
    phoneNumberId: args.phoneNumberId,
    customer: { number: args.customerNumber, name: args.customerName },
    assistantOverrides: args.assistantOverrides,
    metadata: args.metadata,
  });
}
