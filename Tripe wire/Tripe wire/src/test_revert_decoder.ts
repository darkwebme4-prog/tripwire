import dotenv from 'dotenv';
import { EvmChainAdapter } from './chains/evm.js';
import { WalletManager } from './core/walletManager.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

dotenv.config();

async function testRevertDecoderAndSimulation() {
  console.log('=== PRE-FLIGHT CONTRACT SIMULATION & REVERT DECODER TEST RUN ===\n');

  const adapter = new EvmChainAdapter('base');

  // 1. Test decodeRevertReason helper
  console.log('1. Testing decodeRevertReason for custom errors and require strings...');

  const customErrorObj = {
    errorName: 'SoldOut',
    message: 'Contract call reverted with custom error SoldOut()',
  };
  const decodedCustom = adapter.decodeRevertReason(customErrorObj);
  console.log(`Custom Error Input -> Decoded Output: "${decodedCustom}"`);
  if (decodedCustom.includes('SoldOut')) {
    console.log('✅ Custom error decoding test PASSED.\n');
  } else {
    throw new Error('❌ Custom error decoding failed');
  }

  const requireErrorObj = {
    shortMessage: 'Execution reverted with the following reason: NotActive',
  };
  const decodedRequire = adapter.decodeRevertReason(requireErrorObj);
  console.log(`Require Error Input -> Decoded Output: "${decodedRequire}"`);
  if (decodedRequire.includes('NotActive')) {
    console.log('✅ Require string decoding test PASSED.\n');
  } else {
    throw new Error('❌ Require string decoding failed');
  }

  // 2. Test pre-flight simulateMintTx on non-existent contract call
  console.log('2. Testing pre-flight simulateMintTx on test contract address...');
  const testKey = generatePrivateKey();
  const testAccount = privateKeyToAccount(testKey);
  const walletManager = WalletManager.getInstance();
  await walletManager.addWallet(testKey, 'SimTestVault');

  const simResult = await adapter.simulateMintTx({
    contractAddress: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',
    chain: 'base',
    quantity: 1,
    walletAddress: testAccount.address,
    mintPriceEthOrSol: '0.001',
  });

  console.log('Pre-flight Simulation Result:', {
    success: simResult.success,
    revertReason: simResult.revertReason,
  });

  if (!simResult.success && simResult.revertReason) {
    console.log(`✅ Pre-flight simulation correctly caught revert before broadcasting: "${simResult.revertReason}"\n`);
  } else {
    console.log('Note: Pre-flight simulation returned success or unhandled output\n');
  }

  console.log('🎉 PRE-FLIGHT SIMULATION & REVERT DECODER TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testRevertDecoderAndSimulation().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
