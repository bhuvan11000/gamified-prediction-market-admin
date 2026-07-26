import { verifyAuth } from './_shared/auth.js';
import { corsHeaders } from './_shared/cors.js';

const MAIN_APP_URL = process.env.MAIN_APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

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

  if (!CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch(`${MAIN_APP_URL}/api/reset-quests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Main app request failed');

    return new Response(JSON.stringify(data), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
