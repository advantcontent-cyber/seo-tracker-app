// GET /api/ai
// Live AI-engine referral traffic per connected property (GA4 via Windsor.ai).
// Data layer lives in lib/ai.js. See lib/ai.js for scope notes (referral only;
// Google AI Overviews are not separable and are excluded).

import { fetchAiData } from "../../../lib/ai";

export async function GET() {
  try {
    const { data, months, year } = await fetchAiData();
    return Response.json({ ok: true, data, months, year });
  } catch (err) {
    console.error("[/api/ai]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
