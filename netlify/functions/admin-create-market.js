import { verifyAuth } from './_shared/auth.js';
import { corsHeaders } from './_shared/cors.js';
import { supabaseAdmin } from './_shared/supabase.js';

const VALID_CATEGORIES = ['sports', 'tech', 'popculture', 'politics', 'memes'];

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
    const { title, description, category, resolution_criteria, closes_at } = await req.json();

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

    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: errors.join('; ') }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: market, error } = await supabaseAdmin
      .from('markets')
      .insert({
        title: title.trim(),
        description: description.trim(),
        category,
        resolution_criteria: resolution_criteria.trim(),
        source: 'admin',
        status: 'open',
        yes_price: 0.50,
        no_price: 0.50,
        q_yes: 0,
        q_no: 0,
        b: 100,
        opens_at: new Date().toISOString(),
        closes_at: new Date(closes_at).toISOString(),
        approved_by: auth.id,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ market }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { method: 'POST' };
