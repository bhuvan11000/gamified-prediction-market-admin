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
    const { market_id, action, edits } = await req.json();

    if (!market_id || !['approve', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updates = {
      approved_by: auth.id,
      approved_at: new Date().toISOString(),
      status: action === 'approve' ? 'open' : 'rejected',
    };

    if (action === 'approve' && edits) {
      if (edits.title) updates.title = edits.title;
      if (edits.description) updates.description = edits.description;
      if (edits.category) updates.category = edits.category;
      if (edits.resolution_criteria) updates.resolution_criteria = edits.resolution_criteria;
      if (edits.closes_at) updates.closes_at = new Date(edits.closes_at).toISOString();
    }

    const { data: market, error } = await supabaseAdmin
      .from('markets')
      .update(updates)
      .eq('id', market_id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, market }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
