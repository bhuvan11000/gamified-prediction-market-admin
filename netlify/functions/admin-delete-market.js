import { verifyAuth } from './_shared/auth.js';
import { corsHeaders } from './_shared/cors.js';

const MAIN_APP_URL = process.env.MAIN_APP_URL || 'http://localhost:3000';

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

  const authHeader = req.headers.get('authorization');

  try {
    const { market_id } = await req.json();

    if (!market_id) {
      return new Response(JSON.stringify({ error: 'market_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(`${MAIN_APP_URL}/api/admin-delete-market`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({ market_id }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Main app request failed');

    return new Response(JSON.stringify({ success: true, market: data.market }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
