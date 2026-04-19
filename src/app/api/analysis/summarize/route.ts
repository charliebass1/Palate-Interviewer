import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { summarizeInterview } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ interview_id: z.string().uuid() });

// Invoked by the Vapi webhook once a call ends. Trusts its caller — in
// production, require a shared-secret header and verify it here.
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await summarizeInterview(parsed.data.interview_id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, raw: result.raw },
      { status: result.status },
    );
  }
  return NextResponse.json({ summary_id: result.summaryId });
}
