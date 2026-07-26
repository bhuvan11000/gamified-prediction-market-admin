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
    const now = new Date().toISOString();

    const { data: expiredDaily, error: dailyError } = await supabaseAdmin
      .from('user_quests')
      .delete()
      .lt('reset_at', now)
      .eq('completed', false)
      .select('id');

    if (dailyError) throw dailyError;

    const dailyCleaned = expiredDaily?.length || 0;

    const { data: allUserQuests, error: fetchError } = await supabaseAdmin
      .from('user_quests')
      .select(`
        id, user_id,
        quest:quests!inner(type)
      `)
      .eq('completed', true);

    if (fetchError) throw fetchError;

    let weeklyCleaned = 0;
    if (allUserQuests) {
      const weeklyCompletedIds = allUserQuests
        .filter(uq => uq.quest?.type === 'weekly')
        .map(uq => uq.id);

      if (weeklyCompletedIds.length > 0) {
        const { error: weeklyDeleteError } = await supabaseAdmin
          .from('user_quests')
          .delete()
          .in('id', weeklyCompletedIds);

        if (weeklyDeleteError) throw weeklyDeleteError;
        weeklyCleaned = weeklyCompletedIds.length;
      }
    }

    return new Response(JSON.stringify({
      deleted: dailyCleaned + weeklyCleaned,
      type: 'all',
      daily_cleaned: dailyCleaned,
      weekly_cleaned: weeklyCleaned,
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
