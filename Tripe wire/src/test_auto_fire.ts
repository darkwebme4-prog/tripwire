import dotenv from 'dotenv';
import { SessionKeyManager } from './core/sessionKeyManager.js';
import { Repository } from './db/repository.js';
import { initDatabase } from './db/index.js';
import { parseEther, formatEther } from 'viem';

dotenv.config();

async function testAutoFireSessionKeys() {
  console.log('=== ERC-4337 SCOPED SESSION KEY AUTO-FIRE TEST RUN ===\n');

  // 1. Initialize SQLite Database
  console.log('1. Initializing Database...');
  await initDatabase();
  console.log('✅ SQLite DB initialized.\n');

  // 2. Generate Scoped Session Key
  console.log('2. Generating ERC-4337 Scoped Session Key...');
  const manager = SessionKeyManager.getInstance();
  const userWallet = '0x55f5a6319f1D048a3C43567BD95cb1bf2326A7B3';
  const targetContract = '0x1234567890abcdef1234567890abcdef12345678';
  const chain = 'base';
  const maxSpend = parseEther('0.05');

  const sessionKey = await manager.generateSessionKey(
    userWallet,
    targetContract,
    chain,
    maxSpend,
    24,
    'mintPublic'
  );
  console.log('Generated Session Key Record:', {
    id: sessionKey.session_key_id,
    publicAddress: sessionKey.public_address,
    userWallet: sessionKey.user_wallet_address,
    contract: sessionKey.contract_address,
    chain: sessionKey.chain,
    allowedFunction: sessionKey.allowed_function,
    maxSpendEth: formatEther(BigInt(sessionKey.max_spend_wei)),
    expiresAt: sessionKey.expires_at,
  });
  console.log('✅ Session key generation test PASSED.\n');

  // 3. Test Scope & Spend Cap Validation (Valid Case)
  console.log('3. Validating Valid Auto-Fire Request (0.01 ETH)...');
  const validCheck = await manager.validateSessionKey(
    sessionKey.session_key_id,
    targetContract,
    chain,
    parseEther('0.01'),
    'mintPublic'
  );
  console.log('Validation Result (Valid):', validCheck);
  if (validCheck.valid) {
    console.log('✅ Valid scope & spend cap test PASSED.\n');
  } else {
    throw new Error('❌ Valid session key failed validation');
  }

  // 4. Test Spend Cap Enforcement (Exceeding Allowance)
  console.log('4. Validating Over-Cap Auto-Fire Request (0.1 ETH vs 0.05 ETH Cap)...');
  const overCapCheck = await manager.validateSessionKey(
    sessionKey.session_key_id,
    targetContract,
    chain,
    parseEther('0.1'),
    'mintPublic'
  );
  console.log('Validation Result (Over Cap):', overCapCheck);
  if (!overCapCheck.valid && overCapCheck.reason?.includes('Max spend cap exceeded')) {
    console.log('✅ Hard spend cap enforcement test PASSED: Blocked excessive spend request.\n');
  } else {
    throw new Error('❌ Spend cap enforcement failed');
  }

  // 5. Test Scope Enforcement (Wrong Contract or Function Mismatch)
  console.log('5. Validating Wrong Contract Scope...');
  const wrongContractCheck = await manager.validateSessionKey(
    sessionKey.session_key_id,
    '0x9999999999999999999999999999999999999999',
    chain,
    parseEther('0.01'),
    'mintPublic'
  );
  console.log('Validation Result (Wrong Contract):', wrongContractCheck);
  if (!wrongContractCheck.valid && wrongContractCheck.reason?.includes('Contract scope mismatch')) {
    console.log('✅ Contract scope isolation test PASSED.\n');
  } else {
    throw new Error('❌ Contract scope test failed');
  }

  // 6. Test Global /pauseauto Toggle
  console.log('6. Testing Global /pauseauto Command...');
  manager.pauseAutoFire();
  const pausedCheck = await manager.validateSessionKey(
    sessionKey.session_key_id,
    targetContract,
    chain,
    parseEther('0.01'),
    'mintPublic'
  );
  console.log('Validation Result (Global Paused):', pausedCheck);
  if (!pausedCheck.valid && pausedCheck.reason?.includes('Global auto-fire is paused')) {
    console.log('✅ Global /pauseauto test PASSED: All auto-fires blocked.\n');
  } else {
    throw new Error('❌ Global pause test failed');
  }

  manager.resumeAutoFire();

  console.log('🎉 ALL AUTO-FIRE SESSION KEY TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testAutoFireSessionKeys().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
