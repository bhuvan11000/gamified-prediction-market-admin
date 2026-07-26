import { verifyAuth } from './_shared/auth.js';
import { corsHeaders } from './_shared/cors.js';
import { supabaseAdmin } from './_shared/supabase.js';

const VALID_CATEGORIES = ['sports', 'tech', 'popculture', 'politics', 'memes'];

const CATEGORY_KEYWORDS = {
  sports: ['sport', 'game', 'match', 'nba', 'nfl', 'mlb', 'nhl', 'ufc', 'f1', 'tennis', 'soccer', 'football', 'basketball', 'baseball', 'boxing', 'championship', 'tournament', 'olympic', 'race', 'goal', 'score'],
  tech: ['tech', 'apple', 'google', 'microsoft', 'meta', 'tesla', 'ai', 'launch', 'product', 'software', 'update', 'release', 'crypto', 'blockchain', 'spacex', 'nasa', 'robot', 'quantum', 'chip'],
  popculture: ['movie', 'film', 'music', 'album', 'concert', 'oscar', 'grammy', 'celebrity', 'twitter', 'tiktok', 'youtube', 'netflix', 'stream', 'show', 'series', 'gta', 'nintendo', 'playstation', 'xbox'],
  politics: ['election', 'vote', 'president', 'senate', 'congress', 'policy', 'law', 'bill', 'court', 'supreme', 'ukraine', 'russia', 'china', 'trade', 'tariff', 'treaty', 'summit', 'minister'],
};

const BANNED_KEYWORDS = ['kill', 'murder', 'assassinate', 'death of', 'die', 'suicide', 'massacre', 'shooting', 'attack', 'bomb', 'terrorist', 'porn', 'nude', 'sex tape', 'adult content', 'illegal drug', 'child', 'abuse', 'nsfw', 'gore', 'beheading'];

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(titleA, titleB) {
  const normA = normalizeTitle(titleA);
  const normB = normalizeTitle(titleB);
  const wordsA = normA.split(' ');
  const wordsB = normB.split(' ');
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const overlap = wordsA.filter(w => w.length > 2 && wordsB.includes(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

function isQuestion(title) {
  return title.trim().endsWith('?') && title.trim().length > 5;
}

function autoAssignCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const scores = {};
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[cat] = keywords.filter(kw => text.includes(kw)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

function containsBannedContent(text) {
  const lower = text.toLowerCase();
  return BANNED_KEYWORDS.some(kw => lower.includes(kw));
}

function validateMarket(market, existingTitles) {
  const errors = [];
  if (!market.title || typeof market.title !== 'string') errors.push('Missing or invalid title');
  if (!market.description || typeof market.description !== 'string') errors.push('Missing or invalid description');
  if (!market.category || typeof market.category !== 'string') errors.push('Missing or invalid category');
  if (!market.resolution_criteria || typeof market.resolution_criteria !== 'string') errors.push('Missing or invalid resolution_criteria');
  if (!market.closes_at || typeof market.closes_at !== 'string') errors.push('Missing or invalid closes_at');
  if (errors.length > 0) return { valid: false, errors };

  if (!isQuestion(market.title)) errors.push('Title must be a question ending with ?');
  if (market.title.length > 200) errors.push('Title exceeds 200 characters');
  if (market.title.length < 10) errors.push('Title is too short (min 10 chars)');

  const closesAt = new Date(market.closes_at);
  const now = new Date();
  const minDate = new Date(now.getTime() + 86400000);
  const maxDate = new Date(now.getTime() + 7 * 86400000);
  if (isNaN(closesAt.getTime())) errors.push('closes_at is not a valid date');
  else if (closesAt < minDate) errors.push('closes_at must be at least 1 day from now');
  else if (closesAt > maxDate) errors.push('closes_at must be within 7 days from now');

  const validCategory = VALID_CATEGORIES.includes(market.category);
  if (!validCategory) {
    const assigned = autoAssignCategory(market.title, market.description);
    if (assigned) market.category = assigned;
    else errors.push(`Invalid category "${market.category}" and could not auto-assign`);
  }

  if (existingTitles.length > 0) {
    const tooSimilar = existingTitles.some(existing => titleSimilarity(market.title, existing) > 0.7);
    if (tooSimilar) errors.push('Too similar to an existing active market');
  }

  const combinedText = `${market.title} ${market.description} ${market.resolution_criteria}`;
  if (containsBannedContent(combinedText)) errors.push('Contains banned content');

  if (market.resolution_criteria.length < 20) errors.push('Resolution criteria must be at least 20 characters');

  return { valid: errors.length === 0, errors };
}

function buildPrompt(today, existingTitles) {
  const titleList = existingTitles.length > 0
    ? existingTitles.map(t => `- "${t}"`).join('\n')
    : '- (none — no active markets to avoid)';

  return `You are a prediction market generator for a game called Predict Arena.

Today's date: ${today}

Generate exactly 10 prediction markets that resolve within 1-7 days.
Distribute them across these categories (aim for ~2 per category):
- Sports (match outcomes, player stats, tournament results)
- Tech & Science (product launches, company announcements, scientific events)
- Pop Culture (movie/music releases, award shows, celebrity events)
- Politics & World Events (elections, policy decisions, diplomatic events)
- Memes & Fun (internet trends, viral moments, quirky predictions)

RULES:
1. Each market MUST be objectively resolvable — there must be a clear, verifiable answer (YES or NO) by the close date.
2. Include specific resolution criteria — what exactly determines YES vs NO.
3. Use real, current events. Search the web for what's happening right now.
4. Avoid markets about: violence, death predictions about specific people, anything illegal, explicit content.
5. Close dates must be between 1-7 days from today.
6. Make markets INTERESTING — controversial opinions, close calls, and surprising possibilities get more engagement than obvious outcomes.

AVOID DUPLICATES — here are titles of markets already active:
${titleList}

Respond ONLY with a JSON array. Each object must have exactly these fields:
{
  "title": "Clear, concise question ending with ?",
  "description": "2-3 sentence context explaining the market",
  "category": "sports | tech | popculture | politics | memes",
  "resolution_criteria": "Specific conditions that determine YES vs NO",
  "closes_at": "ISO 8601 date-time string (UTC)",
  "suggested_sources": ["URL or source name to check for resolution"]
}`;
}

async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  let markets;
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    markets = JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse Gemini response as JSON');
  }

  if (!Array.isArray(markets)) throw new Error('Gemini response is not an array');
  return { markets };
}

async function insertMarket(market) {
  const { data, error } = await supabaseAdmin
    .from('markets')
    .insert({
      title: market.title.trim(),
      description: market.description.trim(),
      category: market.category,
      resolution_criteria: market.resolution_criteria.trim(),
      source: 'ai',
      status: 'pending',
      yes_price: 0.50,
      no_price: 0.50,
      q_yes: 0,
      q_no: 0,
      b: 100,
      opens_at: new Date().toISOString(),
      closes_at: new Date(market.closes_at).toISOString(),
    })
    .select('id, title')
    .single();

  if (error) throw error;
  return data;
}

async function logGeneration(status, generated, rejected, errorDetails) {
  await supabaseAdmin
    .from('market_generation_log')
    .insert({
      status,
      markets_generated: generated,
      markets_rejected: rejected,
      error_details: errorDetails ? JSON.parse(JSON.stringify(errorDetails)) : null,
    });
}

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
    const today = new Date().toISOString().split('T')[0];

    const { data: recentMarkets } = await supabaseAdmin
      .from('markets')
      .select('title')
      .in('status', ['open', 'pending'])
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .limit(50);

    const existingTitles = (recentMarkets || []).map(m => m.title);
    const prompt = buildPrompt(today, existingTitles);

    let attempt = 1;
    let allMarkets = [];
    let allRejected = [];

    while (attempt <= 2) {
      const result = await callGemini(prompt, apiKey);
      const valid = [];
      const rejected = [];
      for (const market of result.markets) {
        const { valid: isValid, errors } = validateMarket(market, existingTitles);
        if (isValid) valid.push(market);
        else rejected.push({ title: market.title || '(no title)', errors });
      }
      allMarkets = valid;
      allRejected = rejected;
      if (valid.length >= 5) break;
      if (attempt === 1) { attempt++; allRejected = []; }
      else break;
    }

    const inserted = [];
    const insertErrors = [];

    for (const market of allMarkets) {
      try {
        const record = await insertMarket(market);
        inserted.push(record);
      } catch (err) {
        insertErrors.push({ title: market.title, error: err.message });
      }
    }

    const totalRejected = allRejected.length + insertErrors.length;
    const logStatus = inserted.length > 0 ? (inserted.length >= 5 ? 'success' : 'partial') : 'failed';

    await logGeneration(logStatus, inserted.length, totalRejected, {
      rejected_markets: allRejected,
      insert_errors: insertErrors.length > 0 ? insertErrors : undefined,
      attempts: attempt,
    });

    return new Response(JSON.stringify({
      markets_created: inserted.length,
      markets_rejected: totalRejected,
      attempts: attempt,
      status: logStatus,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logGeneration('failed', 0, 0, { error: err.message, stack: err.stack });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
