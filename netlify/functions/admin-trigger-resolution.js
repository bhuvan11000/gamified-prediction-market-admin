import { verifyAuth } from './_shared/auth.js';
import { corsHeaders } from './_shared/cors.js';
import { supabaseAdmin } from './_shared/supabase.js';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const auth = await verifyAuth(req);
  if (!auth || auth.email !== process.env.ADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const now = new Date().toISOString();

    const { data: expiredMarkets, error: fetchError } = await supabaseAdmin
      .from('markets')
      .select('id, title, description, resolution_criteria, category, closes_at')
      .eq('status', 'open')
      .lt('closes_at', now)
      .limit(20);

    if (fetchError) throw fetchError;

    if (!expiredMarkets || expiredMarkets.length === 0) {
      return new Response(JSON.stringify({ resolved: 0, reviewed: 0, failed: 0, total: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const marketList = expiredMarkets.map(m =>
      `- "${m.title}" (category: ${m.category}, closes_at: ${m.closes_at})`
    ).join('\n');

    const prompt = `You are a prediction market resolver. Each market below is now expired and needs to be resolved as YES or NO based on the actual real-world outcome.

For each market, search the web to find the actual outcome and resolve accordingly.

If you are uncertain or cannot find a definitive answer, mark it as "review".

Respond ONLY with a JSON array. Each object:
{
  "market_title": "Exact title from the list",
  "resolution": "yes" | "no" | "review",
  "explanation": "Brief explanation citing sources",
  "source_urls": ["URLs to supporting sources"]
}

Markets to resolve:
${marketList}

If the title is not found in the list, respond with an empty array.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { response_mime_type: 'application/json', temperature: 0.3 },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty response');

    let resolutions;
    try {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
      resolutions = JSON.parse(cleaned);
    } catch {
      throw new Error('Failed to parse Gemini response as JSON');
    }

    if (!Array.isArray(resolutions)) throw new Error('Gemini response is not an array');

    let resolved = 0;
    let reviewed = 0;
    let failed = 0;

    for (const r of resolutions) {
      if (!r.market_title || !r.resolution) continue;

      const market = expiredMarkets.find(m => m.title === r.market_title);
      if (!market) { failed++; continue; }

      if (r.resolution === 'yes' || r.resolution === 'no') {
        const { error: resolveError } = await supabaseAdmin.rpc('resolve_market', {
          p_market_id: market.id,
          p_resolution: r.resolution,
        });
        if (resolveError) { failed++; continue; }
        resolved++;
      } else if (r.resolution === 'review') {
        const { error: reviewError } = await supabaseAdmin
          .from('markets')
          .update({ status: 'review' })
          .eq('id', market.id);
        if (reviewError) { failed++; continue; }
        reviewed++;
      }
    }

    return new Response(JSON.stringify({
      resolved, reviewed, failed,
      total: expiredMarkets.length,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
