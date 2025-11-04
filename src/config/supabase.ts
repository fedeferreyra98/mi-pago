import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const supabaseUrl = config.supabase.url;
const supabaseKey = config.supabase.key;
const serviceRoleKey = config.supabase.serviceRoleKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration');
}

// Client for regular operations (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseKey);

// Client for admin operations (uses service role key)
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || supabaseKey);

export default supabase;
