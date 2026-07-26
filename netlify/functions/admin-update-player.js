import { verifyAuth } from './_shared/auth.js';
import { corsHeaders } from './_shared/cors.js';
import { supabaseAdmin } from './_shared/supabase.js';

const VALID_RANKS = ['Unranked', 'Analyst', 'Strategist', 'Forecaster', 'Visionary', 'Prophet', 'Omniscient'];
const VALID_FIELDS = ['username', 'coins', 'xp', 'level', 'rank', 'total_predictions', 'correct_predictions', 'betting_streak', 'longest_streak', 'last_bet_date', 'last_reward_claim'];

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

  try {
    const { user_id, updates } = await req.json();

    if (!user_id || !updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const invalidFields = Object.keys(updates).filter(k => !VALID_FIELDS.includes(k));
    if (invalidFields.length > 0) {
      return new Response(JSON.stringify({ error: `Invalid fields: ${invalidFields.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (updates.username !== undefined && (typeof updates.username !== 'string' || updates.username.length < 3 || updates.username.length > 30)) {
      return new Response(JSON.stringify({ error: 'Username must be 3-30 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (updates.rank !== undefined && !VALID_RANKS.includes(updates.rank)) {
      return new Response(JSON.stringify({ error: `Invalid rank. Must be one of: ${VALID_RANKS.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (updates.coins !== undefined && (typeof updates.coins !== 'number' || updates.coins < 0)) {
      return new Response(JSON.stringify({ error: 'Coins must be >= 0' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (updates.xp !== undefined && (typeof updates.xp !== 'number' || updates.xp < 0)) {
      return new Response(JSON.stringify({ error: 'XP must be >= 0' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (updates.level !== undefined && (typeof updates.level !== 'number' || updates.level < 1)) {
      return new Response(JSON.stringify({ error: 'Level must be >= 1' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    return new Response(JSON.stringify({ user }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
