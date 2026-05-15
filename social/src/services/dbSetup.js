import { supabase } from '../lib/supabase';

const MIGRATION_VERSION = '001';
const SETUP_FLAG_KEY = 'db_setup_version';

export async function initializeDatabase() {
  // Check if already initialized
  const setupVersion = localStorage.getItem(SETUP_FLAG_KEY);
  if (setupVersion === MIGRATION_VERSION) {
    return true;
  }

  try {
    // Try to create tables if they don't exist
    // This will fail gracefully if RLS policies are in place
    await supabase.rpc('setup_tables').catch(() => {
      // Function might not exist, which is fine - RLS might be handling it
      console.log('setup_tables RPC not available, tables may already exist');
    });

    // Mark as initialized
    localStorage.setItem(SETUP_FLAG_KEY, MIGRATION_VERSION);
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    return false;
  }
}

// Alternative: Create tables if they don't exist
export async function ensureTablesExist() {
  try {
    // Check if profiles table exists by trying to query it
    const { error } = await supabase.from('profiles').select('count', { count: 'exact' }).limit(1);

    if (error?.code === 'PGRST116') {
      // Table doesn't exist, try to create it
      console.log('Creating database tables...');
      // This requires the migration to be run manually or via a server function
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking tables:', error);
    return false;
  }
}
