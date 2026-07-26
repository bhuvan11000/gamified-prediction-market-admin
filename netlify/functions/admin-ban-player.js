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
    const { user_id, ban, reason } = await req.json();

    if (!user_id || typeof ban !== 'boolean') {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    return new Response(JSON.stringify({ user_id, is_banned: user.is_banned, reason: user.ban_reason }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
