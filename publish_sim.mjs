import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const force = process.argv.includes('--force');
const now = new Date().toISOString();

const { data: drafts, error } = await supabase.from('markets').select('id, title, opens_at').eq('status', 'draft');
if (error) { console.error('Error:', error.message); process.exit(1); }

console.log(`Found ${drafts?.length ?? 0} draft(s):`);
drafts?.forEach(m => console.log(`  [${m.opens_at <= now ? 'READY' : 'not yet'}] ${m.title}`));

const toPublish = force ? drafts : (drafts || []).filter(m => m.opens_at <= now);
if (!toPublish.length) {
  console.log(force ? '\nNo drafts found.' : '\nNone ready yet (opens_at not reached). Use --force to publish all drafts now.');
  process.exit(0);
}

const { error: e } = await supabase.from('markets').update({ status: 'open' }).in('id', toPublish.map(m => m.id));
if (e) { console.error('Update error:', e.message); process.exit(1); }
console.log(`\n✓ Published ${toPublish.length} market(s) → status: open`);
