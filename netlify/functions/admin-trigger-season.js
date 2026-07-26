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
    const { data: currentSeason, error: seasonError } = await supabaseAdmin
      .from('seasons')
      .select('*')
      .eq('active', true)
      .single();

    if (seasonError && seasonError.code !== 'PGRST116') throw seasonError;

    if (!currentSeason) {
      const { data: newSeason, error: createError } = await supabaseAdmin
        .from('seasons')
        .insert({
          season_number: 1,
          name: 'Season 1',
          active: true,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) throw createError;

      return new Response(JSON.stringify({
        season_ended: false,
        rewards_awarded: 0,
        new_season: newSeason,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: topPlayers, error: topError } = await supabaseAdmin
      .from('users')
      .select('id, coins, rank')
      .order('coins', { ascending: false })
      .limit(10);

    if (topError) throw topError;

    const rewards = [5000, 3000, 2000, 1000, 800, 600, 400, 300, 200, 100];
    let rewardsAwarded = 0;

    for (let i = 0; i < (topPlayers || []).length; i++) {
      const player = topPlayers[i];
      const reward = rewards[i] || 0;
      if (reward > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({ coins: player.coins + reward })
          .eq('id', player.id);
        if (!updateError) rewardsAwarded++;

        await supabaseAdmin
          .from('coin_transactions')
          .insert({
            user_id: player.id,
            amount: reward,
            type: 'season_reward',
            description: `Season ${currentSeason.season_number} reward (rank #${i + 1})`,
          });
      }
    }

    await supabaseAdmin
      .from('seasons')
      .update({ active: false, ended_at: new Date().toISOString() })
      .eq('id', currentSeason.id);

    const newSeasonNumber = currentSeason.season_number + 1;
    let seasonName;
    if (newSeasonNumber <= 12) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      seasonName = `${months[(newSeasonNumber - 1) % 12]} Season`;
    } else {
      seasonName = `Season ${newSeasonNumber}`;
    }

    const { data: newSeason, error: createNewError } = await supabaseAdmin
      .from('seasons')
      .insert({
        season_number: newSeasonNumber,
        name: seasonName,
        active: true,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createNewError) throw createNewError;

    return new Response(JSON.stringify({
      season_ended: true,
      rewards_awarded: rewardsAwarded,
      new_season: newSeason,
      ended_season: currentSeason.season_number,
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
