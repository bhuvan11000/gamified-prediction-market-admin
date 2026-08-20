import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from('markets')
  .select('id, title, status, created_at')
  .order('created_at', { ascending: false })
  .limit(20);

if (error) { console.error('Error:', error.message); process.exit(1); }

if (!data?.length) { console.log('No markets found at all.'); process.exit(0); }

console.log(`Last ${data.length} markets:\n`);
data.forEach(m => console.log(`  [${m.status}] ${m.title}`));
