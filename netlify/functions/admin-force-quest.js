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
    const { user_quest_id, action } = await req.json();

    if (!user_quest_id || !['increment', 'complete'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;

    if (action === 'complete') {
      const { data, error } = await supabaseAdmin.rpc('complete_quest', {
        p_user_quest_id: user_quest_id,
      });
      if (error) throw error;
      result = data;
    } else if (action === 'increment') {
      const { data, error } = await supabaseAdmin.rpc('update_quest_progress', {
        p_user_quest_id: user_quest_id,
        p_increment: 1,
      });
      if (error) throw error;
      result = data;
    }

    const { data: quest, error: fetchError } = await supabaseAdmin
      .from('user_quests')
      .select('id, progress, completed')
      .eq('id', user_quest_id)
      .single();

    if (fetchError) throw fetchError;

    return new Response(JSON.stringify({ quest }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
