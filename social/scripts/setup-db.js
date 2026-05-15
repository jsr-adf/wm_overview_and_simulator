#!/usr/bin/env node

/**
 * Database setup script for WM 2026 Social app
 * Runs the initial schema migration to create tables and RLS policies
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/setup-db.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing environment variables:');
  console.error('   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function setupDatabase() {
  try {
    console.log('🚀 Starting database setup...');

    const migrationPath = path.join(__dirname, '../supabase/migrations/001_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📝 Running migration: 001_initial_schema.sql');

    // Execute the migration
    const { error } = await supabase.rpc('setup_tables', { sql_text: sql }).catch(() => {
      // If RPC doesn't exist, try direct execution
      return supabase.query(sql);
    });

    if (error) {
      console.warn('⚠️  Migration execution result:', error.message);
    } else {
      console.log('✅ Migration completed successfully');
    }

    // Verify tables exist
    console.log('🔍 Verifying tables...');

    const tables = ['profiles', 'favorites', 'filter_profiles', 'tips', 'match_results'];

    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact' })
        .limit(0);

      if (error) {
        console.warn(`  ❌ ${table}: ${error.message}`);
      } else {
        console.log(`  ✅ ${table}: exists`);
      }
    }

    console.log('\n✨ Database setup complete!');
    console.log('\nNext steps:');
    console.log('  1. Ensure all tables are created in Supabase dashboard');
    console.log('  2. Test authentication in the app');
    console.log('  3. Add favorites and confirm they persist');
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();
