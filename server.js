import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAIN_APP_URL = process.env.MAIN_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const VALID_CATEGORIES = ['sports', 'tech', 'popculture', 'politics', 'memes'];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ── Market generation helpers (run locally, no Netlify timeout) ──

const CATEGORY_KEYWORDS = {
  sports: ['sport', 'game', 'match', 'nba', 'nfl', 'mlb', 'nhl', 'ufc', 'f1',
    'tennis', 'soccer', 'football', 'basketball', 'baseball', 'boxing',
    'championship', 'tournament', 'olympic', 'race', 'goal', 'score'],
  tech: ['tech', 'apple', 'google', 'microsoft', 'meta', 'tesla', 'ai',
    'launch', 'product', 'software', 'update', 'release', 'crypto',
    'blockchain', 'spacex', 'nasa', 'robot', 'quantum', 'chip'],
  popculture: ['movie', 'film', 'music', 'album', 'concert', 'oscar',
    'grammy', 'celebrity', 'twitter', 'tiktok', 'youtube', 'netflix',
    'stream', 'show', 'series', 'gta', 'nintendo', 'playstation', 'xbox'],
  politics: ['election', 'vote', 'president', 'senate', 'congress',
    'policy', 'law', 'bill', 'court', 'supreme', 'ukraine', 'russia',
    'china', 'trade', 'tariff', 'treaty', 'summit', 'minister'],
};

const BANNED_KEYWORDS = [
  'kill', 'murder', 'assassinate', 'death of', 'die', 'suicide',
  'massacre', 'shooting', 'attack', 'bomb', 'terrorist',
  'porn', 'nude', 'sex tape', 'adult content',
  'illegal drug', 'child', 'abuse', 'nsfw', 'gore', 'beheading',
];

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(a, b) {
  const wa = normalizeTitle(a).split(' ');
  const wb = normalizeTitle(b).split(' ');
  if (!wa.length || !wb.length) return 0;
  const overlap = wa.filter(w => w.length > 2 && wb.includes(w)).length;
  return overlap / Math.max(wa.length, wb.length);
}

function isQuestion(title) {
  return title.trim().endsWith('?') && title.trim().length > 5;
}

function autoAssignCategory(title) {
  const text = title.toLowerCase();
  const scores = {};
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[cat] = kws.filter(kw => text.includes(kw)).length;
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
  if (!market.title || typeof market.title !== 'string') errors.push('Missing title');
  if (!market.category || typeof market.category !== 'string') errors.push('Missing category');
  if (!market.resolution_criteria || typeof market.resolution_criteria !== 'string') errors.push('Missing resolution_criteria');
  if (!market.closes_at || typeof market.closes_at !== 'string') errors.push('Missing closes_at');
  if (errors.length) return { valid: false, errors };

  if (!isQuestion(market.title)) errors.push('Title must end with ?');
  if (market.title.length > 200) errors.push('Title too long');
  if (market.title.length < 10) errors.push('Title too short');

  const closesAt = new Date(market.closes_at);
  const minDate = new Date(Date.now() + 86400000);
  const maxDate = new Date(Date.now() + 7 * 86400000);
  if (isNaN(closesAt.getTime())) errors.push('Invalid closes_at date');
  else if (closesAt < minDate) errors.push('closes_at must be at least 1 day away');
  else if (closesAt > maxDate) errors.push('closes_at must be within 7 days');

  if (!VALID_CATEGORIES.includes(market.category)) {
    const assigned = autoAssignCategory(market.title);
    if (assigned) market.category = assigned;
    else errors.push(`Invalid category "${market.category}"`);
  }

  if (existingTitles.some(t => titleSimilarity(market.title, t) > 0.7)) {
    errors.push('Too similar to an existing market');
  }

  if (containsBannedContent(`${market.title} ${market.resolution_criteria}`)) {
    errors.push('Contains banned content');
  }

  if (market.resolution_criteria.length < 20) errors.push('Resolution criteria too short');

  return { valid: errors.length === 0, errors };
}

function buildGenerationPrompt(today, existingTitles) {
  const titleList = existingTitles.length
    ? existingTitles.map(t => `- "${t}"`).join('\n')
    : '- (none)';
  return `You are a prediction market generator for a game called Yay or Nay.

Today's date: ${today}

Generate exactly 10 prediction markets that resolve within 1-7 days.
Distribute them across: Sports, Tech & Science, Pop Culture, Politics & World Events, Memes & Fun.

RULES:
1. Each market MUST be objectively resolvable (clear YES or NO by close date).
2. Include specific resolution criteria.
3. Use real, current events.
4. Avoid: violence, death of specific people, illegal content, explicit content.
5. Close dates: 1-7 days from today.
6. Make markets interesting and engaging.

AVOID DUPLICATES — active markets:
${titleList}

Respond ONLY with a JSON array. Each object: {
  "title": "Question ending with ?",
  "category": "sports | tech | popculture | politics | memes",
  "resolution_criteria": "Specific YES/NO conditions",
  "closes_at": "ISO 8601 UTC datetime"
}`;
}

async function callGeminiDirect(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.7 },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini error (${response.status}): ${body}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
  const markets = JSON.parse(cleaned);
  if (!Array.isArray(markets)) throw new Error('Gemini response is not an array');
  return markets;
}

function nextPublishTime() {
  const now = new Date();
  const publish = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 30, 0, 0));
  if (now >= publish) publish.setUTCDate(publish.getUTCDate() + 1);
  return publish.toISOString();
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

app.use((req, res, next) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload;
  } catch {
    return null;
  }
}

function requireAdmin(handler) {
  return async (req, res) => {
    cors(res);
    const auth = await verifyAuth(req);
    if (!auth || auth.email !== ADMIN_EMAIL) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      await handler(req, res, auth);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

// ── Admin: Create Market ──
app.post('/api/admin-create-market', requireAdmin(async (req, res, auth) => {
  const { title, category, resolution_criteria, closes_at } = req.body;
  const errors = [];
  if (!title || typeof title !== 'string') errors.push('Title is required');
  else {
    if (title.length < 10) errors.push('Title must be at least 10 characters');
    if (title.length > 200) errors.push('Title must not exceed 200 characters');
    if (!title.trim().endsWith('?')) errors.push('Title must end with a question mark');
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    errors.push(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }
  if (!resolution_criteria || typeof resolution_criteria !== 'string') errors.push('Resolution criteria is required');
  else {
    if (resolution_criteria.length < 20) errors.push('Resolution criteria must be at least 20 characters');
    if (resolution_criteria.length > 300) errors.push('Resolution criteria must not exceed 300 characters');
  }
  if (!closes_at) errors.push('Close date is required');
  else {
    const closeDate = new Date(closes_at);
    const now = new Date();
    const maxDate = new Date(now.getTime() + 90 * 86400000);
    if (isNaN(closeDate.getTime())) errors.push('Invalid close date');
    else if (closeDate < now) errors.push('Close date must be in the future');
    else if (closeDate > maxDate) errors.push('Close date must be within 90 days from now');
  }
  if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

  const { data: market, error } = await supabaseAdmin
    .from('markets')
    .insert({
      title: title.trim(),
      category,
      resolution_criteria: resolution_criteria.trim(),
      source: 'admin',
      status: 'open',
      yes_price: 0.50, no_price: 0.50,
      q_yes: 0, q_no: 0, b: 100,
      opens_at: new Date().toISOString(),
      closes_at: new Date(closes_at).toISOString(),
      approved_by: auth.sub,
      approved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  res.json({ market });
}));

// ── Admin: Delete Market (proxies to main app) ──
app.post('/api/admin-delete-market', requireAdmin(async (req, res) => {
  const { market_id } = req.body;
  if (!market_id) return res.status(400).json({ error: 'market_id is required' });

  if (!MAIN_APP_URL) return res.status(500).json({ error: 'MAIN_APP_URL not configured' });

  const authHeader = req.headers.authorization;
  const response = await fetch(`${MAIN_APP_URL}/api/admin-delete-market`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({ market_id }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Main app request failed');
  res.json({ success: true, market: data.market });
}));

// ── Admin: Resolve Market ──
app.post('/api/admin-resolve-market', requireAdmin(async (req, res) => {
  const { market_id, resolution } = req.body;
  if (!market_id || !['yes', 'no'].includes(resolution)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { data: market } = await supabaseAdmin
    .from('markets')
    .select('status')
    .eq('id', market_id)
    .single();

  if (market?.status === 'review') {
    const { error: updateErr } = await supabaseAdmin
      .from('markets')
      .update({ status: 'resolving' })
      .eq('id', market_id);
    if (updateErr) throw updateErr;
  }

  const { data: result, error } = await supabaseAdmin.rpc('resolve_market', {
    p_market_id: market_id,
    p_resolution: resolution,
  });
  if (error) throw error;
  res.json({ success: true, result });
}));

// ── Admin: Cancel Market ──
app.post('/api/admin-cancel-market', requireAdmin(async (req, res) => {
  const { market_id } = req.body;
  if (!market_id) return res.status(400).json({ error: 'market_id is required' });
  const { data: result, error } = await supabaseAdmin.rpc('cancel_market', {
    p_market_id: market_id,
  });
  if (error) throw error;
  res.json({ success: true, result });
}));

// ── Trigger helpers ──
async function proxyToMain(endpoint, req, res) {
  if (!MAIN_APP_URL) return res.status(500).json({ error: 'MAIN_APP_URL not configured' });
  if (!CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  const response = await fetch(`${MAIN_APP_URL}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Main app request failed');
  res.json(data);
}

app.post('/api/admin-generate-markets-preview', requireAdmin(async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { data: recentMarkets } = await supabaseAdmin
    .from('markets')
    .select('title')
    .in('status', ['open', 'draft'])
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(50);

  const existingTitles = (recentMarkets || []).map(m => m.title);
  const today = new Date().toISOString().split('T')[0];
  const prompt = buildGenerationPrompt(today, existingTitles);

  const rawMarkets = await callGeminiDirect(prompt);

  const valid = [];
  const rejected = [];
  for (const market of rawMarkets) {
    const { valid: isValid, errors } = validateMarket(market, existingTitles);
    if (isValid) valid.push(market);
    else rejected.push({ ...market, errors });
  }

  res.json({ valid, rejected, opens_at: nextPublishTime() });
}));

app.post('/api/admin-save-markets', requireAdmin(async (req, res) => {
  const { markets } = req.body;
  if (!markets?.length) return res.status(400).json({ error: 'No markets provided' });

  const opensAt = nextPublishTime();
  const inserted = [];
  const insertErrors = [];

  for (const market of markets) {
    const { data, error } = await supabaseAdmin
      .from('markets')
      .insert({
        title: market.title.trim(),
        category: market.category,
        resolution_criteria: market.resolution_criteria.trim(),
        source: 'ai',
        status: 'draft',
        yes_price: 0.50,
        no_price: 0.50,
        q_yes: 0,
        q_no: 0,
        b: 100,
        opens_at: opensAt,
        closes_at: new Date(market.closes_at).toISOString(),
      })
      .select('id, title')
      .single();

    if (error) insertErrors.push({ title: market.title, error: error.message });
    else inserted.push(data);
  }

  // Log to market_generation_log
  await supabaseAdmin.from('market_generation_log').insert({
    status: inserted.length >= 5 ? 'success' : inserted.length > 0 ? 'partial' : 'failed',
    markets_generated: inserted.length,
    markets_rejected: insertErrors.length,
    error_details: insertErrors.length > 0 ? { insert_errors: insertErrors } : null,
  });

  res.json({ inserted, errors: insertErrors });
}));

// ── Admin: Draft Queue (uses service role to bypass RLS) ──
app.post('/api/admin-drafts', requireAdmin(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('markets')
    .select('*')
    .eq('status', 'draft')
    .order('created_at', { ascending: false });
  if (error) throw error;
  res.json(data || []);
}));

app.post('/api/admin-publish-draft', requireAdmin(async (req, res) => {
  const { market_id } = req.body;
  if (!market_id) return res.status(400).json({ error: 'market_id required' });
  const { error } = await supabaseAdmin
    .from('markets')
    .update({ status: 'open', opens_at: new Date().toISOString() })
    .eq('id', market_id)
    .eq('status', 'draft');
  if (error) throw error;
  res.json({ success: true });
}));

app.post('/api/admin-trigger-season', requireAdmin((req, res) => proxyToMain('season-transition', req, res)));
app.post('/api/admin-trigger-reset-quests', requireAdmin((req, res) => proxyToMain('reset-quests', req, res)));

// ── Admin: All Markets (manual resolution) ──
app.post('/api/admin-all-markets', requireAdmin(async (req, res) => {
  const { include_history } = req.body || {};
  const { data: markets, error } = await supabaseAdmin
    .from('markets')
    .select('*')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  // Default view: actionable markets + resolved/cancelled within the last 7 days.
  // Old resolved/cancelled markets only appear with include_history: true.
  const HISTORY_WINDOW_DAYS = 7;
  const ACTIONABLE_STATUSES = ['open', 'closed', 'review', 'resolving'];

  if (!include_history) {
    const cutoff = Date.now() - HISTORY_WINDOW_DAYS * 86400000;
    const visible = (markets || []).filter((m) => {
      if (ACTIONABLE_STATUSES.includes(m.status)) return true;
      // resolved and cancelled both set resolved_at; fall back to created_at
      return new Date(m.resolved_at || m.created_at).getTime() >= cutoff;
    });
    return res.json(visible);
  }

  res.json(markets || []);
}));

// ── Admin: Update Player ──
const VALID_RANKS = ['Unranked', 'Analyst', 'Strategist', 'Forecaster', 'Visionary', 'Prophet', 'Omniscient'];
const VALID_FIELDS = ['username', 'coins', 'xp', 'level', 'rank', 'total_predictions', 'correct_predictions', 'betting_streak', 'longest_streak', 'last_bet_date', 'last_reward_claim'];

app.post('/api/admin-update-player', requireAdmin(async (req, res) => {
  const { user_id, updates } = req.body;
  if (!user_id || !updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  const invalidFields = Object.keys(updates).filter(k => !VALID_FIELDS.includes(k));
  if (invalidFields.length > 0) return res.status(400).json({ error: `Invalid fields: ${invalidFields.join(', ')}` });

  if (updates.username !== undefined && (typeof updates.username !== 'string' || updates.username.length < 3 || updates.username.length > 30)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters' });
  }
  if (updates.rank !== undefined && !VALID_RANKS.includes(updates.rank)) {
    return res.status(400).json({ error: `Invalid rank. Must be one of: ${VALID_RANKS.join(', ')}` });
  }
  if (updates.coins !== undefined && (typeof updates.coins !== 'number' || updates.coins < 0)) {
    return res.status(400).json({ error: 'Coins must be >= 0' });
  }
  if (updates.xp !== undefined && (typeof updates.xp !== 'number' || updates.xp < 0)) {
    return res.status(400).json({ error: 'XP must be >= 0' });
  }
  if (updates.level !== undefined && (typeof updates.level !== 'number' || updates.level < 1)) {
    return res.status(400).json({ error: 'Level must be >= 1' });
  }

  if (updates.correct_predictions !== undefined || updates.total_predictions !== undefined) {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('total_predictions, correct_predictions')
      .eq('id', user_id)
      .single();
    const total = updates.total_predictions ?? user.total_predictions;
    const correct = updates.correct_predictions ?? user.correct_predictions;
    updates.accuracy = total > 0 ? correct / total : 0;
  }

  if (updates.coins !== undefined && updates.rank === undefined) {
    const { data: rank } = await supabaseAdmin.rpc('get_rank_from_coins', { p_coins: updates.coins });
    if (rank) updates.rank = rank;
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', user_id)
    .select()
    .single();

  if (error) throw error;
  res.json({ user });
}));

// ── Admin: Ban Player ──
app.post('/api/admin-ban-player', requireAdmin(async (req, res) => {
  const { user_id, ban, reason } = req.body;
  if (!user_id || typeof ban !== 'boolean') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  const updates = { is_banned: ban };
  if (ban && reason) updates.ban_reason = reason;
  if (!ban) updates.ban_reason = null;

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', user_id)
    .select('id, is_banned, ban_reason')
    .single();

  if (error) throw error;
  res.json({ user_id, is_banned: user.is_banned, reason: user.ban_reason });
}));

// ── Admin: Reset Daily Reward ──
app.post('/api/admin-reset-daily-reward', requireAdmin(async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  const { error } = await supabaseAdmin
    .from('users')
    .update({ last_reward_claim: null, last_bet_date: new Date().toISOString().split('T')[0] })
    .eq('id', user_id);

  if (error) throw error;
  res.json({ success: true });
}));

// ── Admin: Review Markets ──
app.post('/api/admin-markets-review', requireAdmin(async (req, res) => {
  const { data: markets } = await supabaseAdmin
    .from('markets')
    .select('*')
    .eq('status', 'review')
    .order('created_at', { ascending: false });

  if (markets && markets.length > 0) {
    const marketIds = markets.map(m => m.id);
    let disputes = [];
    try {
      const { data: d } = await supabaseAdmin
        .from('market_disputes')
        .select('*, user:user_id(username)')
        .in('market_id', marketIds)
        .order('created_at', { ascending: true });
      disputes = d || [];
    } catch {}

    const disputeMap = {};
    for (const d of disputes) {
      if (!disputeMap[d.market_id]) disputeMap[d.market_id] = [];
      disputeMap[d.market_id].push(d);
    }

    return res.json(markets.map(m => ({
      ...m,
      disputes: disputeMap[m.id] || [],
      dispute_count: (disputeMap[m.id] || []).length,
    })));
  }

  res.json(markets || []);
}));

// ── Admin: Player Quests ──
app.get('/api/admin-player-quests', requireAdmin(async (req, res) => {
  const user_id = req.query.user_id;
  if (!user_id) return res.status(400).json({ error: 'user_id query parameter is required' });

  const { data: quests, error } = await supabaseAdmin
    .from('user_quests')
    .select(`
      id, user_id, quest_id, progress, completed, assigned_at, reset_at,
      quest:quests!inner(title, description, type, action_type, target, xp_reward, coin_reward, criteria)
    `)
    .eq('user_id', user_id)
    .order('assigned_at', { ascending: false });

  if (error) throw error;

  const formatted = (quests || []).map((uq) => ({
    id: uq.id,
    user_id: uq.user_id,
    quest_id: uq.quest_id,
    title: uq.quest?.title,
    description: uq.quest?.description,
    type: uq.quest?.type,
    action_type: uq.quest?.action_type,
    target: uq.quest?.target,
    xp_reward: uq.quest?.xp_reward,
    coin_reward: uq.quest?.coin_reward,
    progress: uq.progress,
    completed: uq.completed,
    assigned_at: uq.assigned_at,
    reset_at: uq.reset_at,
  }));

  res.json({ quests: formatted });
}));

// ── Admin: Force Quest ──
app.post('/api/admin-force-quest', requireAdmin(async (req, res) => {
  const { user_quest_id, action } = req.body;
  if (!user_quest_id || !['increment', 'complete'].includes(action)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  if (action === 'increment') {
    const { data: current } = await supabaseAdmin
      .from('user_quests')
      .select('progress')
      .eq('id', user_quest_id)
      .single();

    if (!current) return res.status(404).json({ error: 'User quest not found' });

    await supabaseAdmin
      .from('user_quests')
      .update({ progress: (current.progress || 0) + 1 })
      .eq('id', user_quest_id);
  } else if (action === 'complete') {
    const { data: uq } = await supabaseAdmin
      .from('user_quests')
      .select('user_id, quest_id')
      .eq('id', user_quest_id)
      .single();

    if (!uq) return res.status(404).json({ error: 'User quest not found' });

    const { data: questDef } = await supabaseAdmin
      .from('quests')
      .select('target, coin_reward, xp_reward')
      .eq('id', uq.quest_id)
      .single();

    const target = questDef?.target || 1;

    await supabaseAdmin.rpc('complete_quest', {
      p_user_quest_id: user_quest_id,
      p_user_id: uq.user_id,
      p_coins: questDef?.coin_reward || 0,
      p_xp: questDef?.xp_reward || 0,
      p_new_progress: target,
    });
  }

  const { data: quest, error: fetchError } = await supabaseAdmin
    .from('user_quests')
    .select('id, progress, completed')
    .eq('id', user_quest_id)
    .single();

  if (fetchError) throw fetchError;
  res.json({ quest });
}));

// ── Community Proposal helpers ──
const COMMUNITY_REWARDS_BY_RANK = {
  'Unranked':   { proposalCost: 50,   approvalReward: 75,   approvalXp: 100 },
  'Analyst':    { proposalCost: 100,  approvalReward: 150,  approvalXp: 100 },
  'Strategist': { proposalCost: 200,  approvalReward: 300,  approvalXp: 100 },
  'Forecaster': { proposalCost: 500,  approvalReward: 750,  approvalXp: 100 },
  'Visionary':  { proposalCost: 1000, approvalReward: 1500, approvalXp: 100 },
  'Prophet':    { proposalCost: 2500, approvalReward: 3750, approvalXp: 100 },
  'Omniscient': { proposalCost: 5000, approvalReward: 7500, approvalXp: 100 },
};

function getApprovalReward(rank) {
  const r = COMMUNITY_REWARDS_BY_RANK[rank] || COMMUNITY_REWARDS_BY_RANK['Unranked'];
  return { coins: r.approvalReward, xp: r.approvalXp };
}

const RANK_THRESHOLDS = [
  { name: 'Unranked', minCoins: 0 },
  { name: 'Analyst', minCoins: 2500 },
  { name: 'Strategist', minCoins: 5000 },
  { name: 'Forecaster', minCoins: 10000 },
  { name: 'Visionary', minCoins: 25000 },
  { name: 'Prophet', minCoins: 75000 },
  { name: 'Omniscient', minCoins: 250000 },
];

const RANK_ORDER = {
  'Unranked': 0, 'Analyst': 1, 'Strategist': 2, 'Forecaster': 3,
  'Visionary': 4, 'Prophet': 5, 'Omniscient': 6,
};

function getRank(coins) {
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (coins >= RANK_THRESHOLDS[i].minCoins) return RANK_THRESHOLDS[i].name;
  }
  return 'Unranked';
}

// ── Admin: List Pending Proposals ──
app.post('/api/admin-pending-proposals', requireAdmin(async (req, res) => {
  const { data: proposals } = await supabaseAdmin
    .from('community_proposals')
    .select('*')
    .eq('status', 'pending')
    .order('proposed_at', { ascending: false });

  if (!proposals || proposals.length === 0) return res.json([]);

  const proposerIds = [...new Set(proposals.map(p => p.proposer_id))];
  const { data: proposers } = await supabaseAdmin
    .from('users')
    .select('id, username, rank, level')
    .in('id', proposerIds);

  const proposerMap = {};
  if (proposers) {
    for (const u of proposers) proposerMap[u.id] = u;
  }

  const result = proposals.map(p => ({
    ...p,
    proposer: proposerMap[p.proposer_id] || null,
  }));

  res.json(result);
}));

// ── Admin: Approve Proposal ──
app.post('/api/admin-approve-proposal', requireAdmin(async (req, res) => {
  const { proposal_id } = req.body;
  if (!proposal_id) return res.status(400).json({ error: 'proposal_id is required' });

  const { data: proposal, error: fetchErr } = await supabaseAdmin
    .from('community_proposals')
    .select('*')
    .eq('id', proposal_id)
    .single();

  if (fetchErr || !proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'pending') return res.status(400).json({ error: 'Proposal is no longer pending' });

  // Re-count actual votes
  const { count: upvotes } = await supabaseAdmin
    .from('proposal_votes')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', proposal_id)
    .eq('vote', 'up');

  const { count: downvotes } = await supabaseAdmin
    .from('proposal_votes')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', proposal_id)
    .eq('vote', 'down');

  const up = upvotes || 0;
  const down = downvotes || 0;

  // Fetch proposer
  const { data: proposer } = await supabaseAdmin
    .from('users')
    .select('coins, xp, level, rank')
    .eq('id', proposal.proposer_id)
    .single();

  const reward = proposer ? getApprovalReward(proposer.rank) : { coins: 75, xp: 100 };

  if (proposer) {
    const newCoins = proposer.coins + proposal.stake_amount + reward.coins;
    const newXp = proposer.xp + reward.xp;

    await supabaseAdmin
      .from('users')
      .update({ coins: newCoins, xp: newXp })
      .eq('id', proposal.proposer_id);

    // Check rank change
    const newRank = getRank(newCoins);
    if (newRank !== proposer.rank) {
      await supabaseAdmin
        .from('users')
        .update({ rank: newRank })
        .eq('id', proposal.proposer_id);
    }

    // Create market
    const { data: market, error: marketError } = await supabaseAdmin
      .from('markets')
      .insert({
        title: proposal.title,
        category: proposal.category,
        resolution_criteria: proposal.resolution_criteria,
        source: 'community',
        status: 'open',
        creator_id: proposal.proposer_id,
        closes_at: proposal.closes_at,
        opens_at: new Date().toISOString(),
        q_yes: 0, q_no: 0, b: 100,
        yes_price: 0.50, no_price: 0.50,
      })
      .select()
      .single();

    if (marketError) console.error('Market creation failed:', marketError.message);
  }

  // Update proposal
  await supabaseAdmin
    .from('community_proposals')
    .update({ upvotes: up, downvotes: down, status: 'approved' })
    .eq('id', proposal_id);

  res.json({ success: true, proposal_id, status: 'approved' });
}));

// ── Admin: Reject Proposal ──
app.post('/api/admin-reject-proposal', requireAdmin(async (req, res) => {
  const { proposal_id } = req.body;
  if (!proposal_id) return res.status(400).json({ error: 'proposal_id is required' });

  const { data: proposal, error: fetchErr } = await supabaseAdmin
    .from('community_proposals')
    .select('id, status')
    .eq('id', proposal_id)
    .single();

  if (fetchErr || !proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status !== 'pending') return res.status(400).json({ error: 'Proposal is no longer pending' });

  await supabaseAdmin
    .from('community_proposals')
    .update({ status: 'rejected' })
    .eq('id', proposal_id);

  res.json({ success: true, proposal_id, status: 'rejected' });
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Admin API server running on http://localhost:${PORT}`);
});
