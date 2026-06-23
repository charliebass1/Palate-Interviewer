import { z } from "zod";
import { isMockMode } from "./mock/config";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // Renamed late-2025: Supabase replaced anon → publishable and
  // service_role → secret. The loader (below) accepts either env-var
  // name and surfaces under the new canonical name here.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),

  VAPI_API_KEY: z.string().optional(),
  VAPI_WEBHOOK_SECRET: z.string().optional(),
  VAPI_ASSISTANT_ID: z.string().optional(),
  VAPI_PHONE_NUMBER_ID: z.string().optional(),

  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  // Opt-in to use your own ElevenLabs account from Vapi (otherwise Vapi
  // proxies ElevenLabs with its own credential). Pass through to assistant.
  ELEVENLABS_VIA_VAPI_BYO: z.enum(["true", "false"]).optional().default("false"),
  LLAMA_CLOUD_API_KEY: z.string().optional(),

  APP_URL: z.string().url().default("http://localhost:3000"),

  // Dev-only tools (paste-in transcript, etc). Leave off in production.
  NEXT_PUBLIC_ENABLE_DEV_TOOLS: z
    .enum(["true", "false"])
    .optional()
    .default("false"),

  // Hide /debug once initial configuration is stable. Defaults to showing
  // because the page is meant to be hit BEFORE the first login exists.
  DEBUG_DISABLED: z.enum(["true", "false"]).optional().default("false"),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  // In mock mode the app runs with no real backend, so fill the required
  // fields with harmless placeholders — nothing ever calls out with them.
  const mock = isMockMode();
  const fallback = (real: string | undefined, placeholder: string) =>
    real || (mock ? placeholder : undefined);

  // Accept both new (publishable / secret) and legacy (anon /
  // service_role) variable names. Prefer new if both are set.
  const normalized = {
    ...process.env,
    ANTHROPIC_API_KEY: fallback(process.env.ANTHROPIC_API_KEY, "sk-ant-mock"),
    NEXT_PUBLIC_SUPABASE_URL: fallback(process.env.NEXT_PUBLIC_SUPABASE_URL, "http://localhost:54321"),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fallback(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "sb_publishable_mock",
    ),
    SUPABASE_SECRET_KEY: fallback(
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
      "sb_secret_mock",
    ),
  };

  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function publicEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  };
}
