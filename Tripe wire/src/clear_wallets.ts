import dotenv from 'dotenv';
import { initDatabase } from './db/index.js';
import { Repository } from './db/repository.js';
import { WalletManager } from './core/walletManager.js';

dotenv.config();

async function clearAllWallets() {
  console.log('=== CLEAR ALL WALLETS RUN ===\n');

  await initDatabase();
  const walletManager = WalletManager.getInstance();

  const count = await walletManager.removeAllWallets();
  console.log(`✅ Successfully removed ${count} wallet(s) from SQLite database & in-memory key store.`);

  const remaining = await Repository.getActiveWallets();
  console.log(`Remaining Active Wallets in DB: ${remaining.length}`);

  if (remaining.length === 0) {
    console.log('🎉 DB & IN-MEMORY WALLETS ARE FULLY WIPED CLEAN!');
    process.exit(0);
  } else {
    console.error('❌ Failed to wipe all wallets');
    process.exit(1);
  }
}

clearAllWallets().catch((err) => {
  console.error('❌ Error clearing wallets:', err);
  process.exit(1);
});
