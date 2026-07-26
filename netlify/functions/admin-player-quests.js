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

  try {
    const url = new URL(req.url);
    const user_id = url.searchParams.get('user_id');

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id query parameter is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: quests, error } = await supabaseAdmin
      .from('user_quests')
      .select(`
        id, user_id, quest_id, progress, completed, assigned_at, reset_at,
        quest:quests!inner(title, description, type, action_type, target, xp_reward, coin_reward, criteria)
      `)
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

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

    return new Response(JSON.stringify({ quests: formatted }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'GET' };
