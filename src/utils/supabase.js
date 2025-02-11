import { createClient } from '@supabase/supabase-js'

// Use the exact variables from your .env.local
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Add debug logging
console.log('Debug - Supabase Configuration:', {
  url: supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
  client: !!supabase,
  timestamp: new Date().toISOString()
}); 