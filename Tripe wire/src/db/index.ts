import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DATABASE_PATH || 'mint_bot.db';
const url = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;

export const db = createClient({
  url,
});

export async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS watched_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'MONITORING',
      target_function TEXT DEFAULT 'mint',
      mode TEXT NOT NULL DEFAULT 'MANUAL',
      session_key_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(contract_address, chain)
    );
  `);

  // Migration for existing database files: ensure mode and session_key_id columns exist
  try {
    await db.execute(`ALTER TABLE watched_contracts ADD COLUMN mode TEXT NOT NULL DEFAULT 'MANUAL'`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(`ALTER TABLE watched_contracts ADD COLUMN session_key_id TEXT`);
  } catch {
    // Column already exists
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS wallet_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      chain_type TEXT NOT NULL,
      public_address TEXT NOT NULL UNIQUE,
      env_var_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS session_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key_id TEXT UNIQUE NOT NULL,
      public_address TEXT NOT NULL,
      private_key TEXT NOT NULL,
      user_wallet_address TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      allowed_function TEXT NOT NULL DEFAULT 'mintPublic',
      max_spend_wei TEXT NOT NULL,
      current_spent_wei TEXT NOT NULL DEFAULT '0',
      expires_at INTEGER NOT NULL,
      is_revoked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mint_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL,
      tx_hash TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
