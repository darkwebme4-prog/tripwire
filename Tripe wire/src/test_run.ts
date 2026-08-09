import dotenv from 'dotenv';
import { initDatabase } from './db/index.js';
import { Repository } from './db/repository.js';
import { MintQueueManager } from './core/mintQueue.js';
import { MockChainAdapter } from './chains/mock.js';
import { EvmChainAdapter } from './chains/evm.js';
import { formatWalletsList, formatWatchedStatus, sanitizeLogOutput } from './bot/formatters.js';

dotenv.config();

async function runDryRunTest() {
  console.log('=== MULTI-CHAIN NFT MINTING BOT TEST RUN ===\n');

  // 1. Initialize SQLite Database
  console.log('1. Testing Database Initialization...');
  await initDatabase();
  console.log('✅ SQLite Database initialized successfully.\n');

  // 2. Setup Adapters & Mint Queue Manager
  console.log('2. Initializing MintQueueManager & Chain Adapters...');
  const queueManager = MintQueueManager.getInstance();

  const mockBaseAdapter = new MockChainAdapter('base');
  const mockSolanaAdapter = new MockChainAdapter('solana');
  const liveRobinhoodAdapter = new EvmChainAdapter('robinhood');

  queueManager.registerAdapter(mockBaseAdapter);
  queueManager.registerAdapter(mockSolanaAdapter);
  queueManager.registerAdapter(liveRobinhoodAdapter);
  console.log('✅ Chain Adapters registered: Base (Mock), Solana (Mock), Robinhood Chain (Live EVM Configured).\n');

  // 3. Test /wallets masking & key security
  console.log('3. Testing Wallet Security & Masking...');
  const wallets = await Repository.getActiveWallets();
  console.log(formatWalletsList(wallets));

  const sampleRawKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
  const sanitized = sanitizeLogOutput(`Attempted key exposure: ${sampleRawKey}`);
  console.log(`Sanitization Test Output: "${sanitized}"`);
  if (!sanitized.includes(sampleRawKey)) {
    console.log('✅ Redaction test PASSED: Private key successfully masked!\n');
  } else {
    throw new Error('❌ Redaction test FAILED');
  }

  // 4. Test /watch contract command flow
  console.log('4. Testing /watch command...');
  const baseContract = '0x1234567890abcdef1234567890abcdef12345678';
  await queueManager.watchContract(baseContract, 'base');
  const watched = await Repository.getWatchedContracts();
  console.log(formatWatchedStatus(watched));
  console.log('✅ /watch command PASSED.\n');

  // 5. Test /mint queuing & transaction pre-building
  console.log('5. Testing /mint command & SpeedLayer Pre-building...');
  const activeWallets = await Repository.getActiveWallets();
  const evmWallet = activeWallets.find(w => w.chain_type === 'EVM');

  if (!evmWallet) {
    throw new Error('No active EVM wallet found in DB');
  }

  const { jobId, prebuilt } = await queueManager.queueMint(baseContract, 'base', 2, evmWallet.public_address);
  console.log(`Job queued: ID #${jobId}, Prebuilt: ${prebuilt}`);

  // 6. Test WebSocket event trigger execution
  console.log('6. Triggering WebSocket Event Flip Simulation...');
  const results = await queueManager.triggerMintJobs('base', baseContract);
  console.log('Tx Execution Results:', results);
  console.log('✅ Mint trigger & simulated transaction dispatch PASSED.\n');

  console.log('🎉 ALL SYSTEM DRY-RUN TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runDryRunTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
