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

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
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
  const { title, description, category, resolution_criteria, closes_at } = req.body;
  const errors = [];
  if (!title || typeof title !== 'string') errors.push('Title is required');
  else {
    if (title.length < 10) errors.push('Title must be at least 10 characters');
    if (title.length > 200) errors.push('Title must not exceed 200 characters');
    if (!title.trim().endsWith('?')) errors.push('Title must end with a question mark');
  }
  if (!description || typeof description !== 'string') errors.push('Description is required');
  else {
    if (description.length < 20) errors.push('Description must be at least 20 characters');
    if (description.length > 500) errors.push('Description must not exceed 500 characters');
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
      description: description.trim(),
      category,
      resolution_criteria: resolution_criteria.trim(),
      source: 'admin',
      status: 'open',
      yes_price: 0.50, no_price: 0.50,
      q_yes: 0, q_no: 0, b: 100,
      opens_at: new Date().toISOString(),
      closes_at: new Date(closes_at).toISOString(),
      approved_by: auth.id,
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

app.post('/api/admin-trigger-generation', requireAdmin((req, res) => proxyToMain('generate-markets', req, res)));
app.post('/api/admin-trigger-resolution', requireAdmin((req, res) => proxyToMain('resolve-expired-markets', req, res)));
app.post('/api/admin-trigger-season', requireAdmin((req, res) => proxyToMain('season-transition', req, res)));
app.post('/api/admin-trigger-reset-quests', requireAdmin((req, res) => proxyToMain('reset-quests', req, res)));

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

  let result;
  if (action === 'complete') {
    const { data, error } = await supabaseAdmin.rpc('complete_quest', { p_user_quest_id: user_quest_id });
    if (error) throw error;
    result = data;
  } else if (action === 'increment') {
    const { data, error } = await supabaseAdmin.rpc('update_quest_progress', { p_user_quest_id: user_quest_id, p_increment: 1 });
    if (error) throw error;
    result = data;
  }

  const { data: quest, error: fetchError } = await supabaseAdmin
    .from('user_quests')
    .select('id, progress, completed')
    .eq('id', user_quest_id)
    .single();

  if (fetchError) throw fetchError;
  res.json({ quest });
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Admin API server running on http://localhost:${PORT}`);
});
