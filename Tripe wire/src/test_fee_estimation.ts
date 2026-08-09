import dotenv from 'dotenv';
import { EvmChainAdapter } from './chains/evm.js';
import { SecurityGuard } from './core/securityGuard.js';
import { WalletManager } from './core/walletManager.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

dotenv.config();

async function testFeeEstimationAndTxBuilding() {
  console.log('=== END-TO-END EIP-1559 FEE ESTIMATION & TX BUILDING TEST RUN ===\n');

  // 1. Setup WalletManager with a valid non-test account
  const walletManager = WalletManager.getInstance();
  const testKey = generatePrivateKey();
  const testAccount = privateKeyToAccount(testKey);
  await walletManager.addWallet(testKey, 'TestFeeVault');
  console.log(`Registered test wallet: ${testAccount.address}\n`);

  // 2. Test EVM Chains (Robinhood, Base, Ethereum, Arbitrum)
  const chainsToTest = ['robinhood', 'base', 'ethereum', 'arbitrum'] as const;

  for (const chain of chainsToTest) {
    console.log(`--- Testing Chain: ${chain.toUpperCase()} ---`);
    const adapter = new EvmChainAdapter(chain);

    const mintParams = {
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      chain,
      quantity: 1,
      walletAddress: testAccount.address,
      mintPriceEthOrSol: '0.001',
    };

    // A. Test getGasEstimate() using estimateFeesPerGas()
    const gasFees = await adapter.getGasEstimate(mintParams);
    console.log(`Gas Fees for ${chain}:`, {
      estimatedGas: gasFees.estimatedGas.toString(),
      maxFeePerGas: gasFees.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas?.toString(),
      estimatedCostEth: gasFees.estimatedCostEthOrSol,
    });

    if (!gasFees.maxFeePerGas || !gasFees.maxPriorityFeePerGas) {
      throw new Error(`❌ Gas estimation failed to return EIP-1559 fee fields for ${chain}`);
    }

    // B. Test buildMintTx() and verify type: 'eip1559' & required fee fields
    const builtTx = await adapter.buildMintTx(mintParams);
    console.log(`Built Transaction Payload for ${chain}:`, {
      type: builtTx.rawPayload.type,
      to: builtTx.rawPayload.to,
      nonce: builtTx.rawPayload.nonce,
      maxFeePerGas: builtTx.rawPayload.maxFeePerGas.toString(),
      maxPriorityFeePerGas: builtTx.rawPayload.maxPriorityFeePerGas.toString(),
    });

    if (builtTx.rawPayload.type !== 'eip1559') {
      throw new Error(`❌ Built transaction missing type 'eip1559' on ${chain}`);
    }

    // C. Test Pre-flight assertion
    SecurityGuard.assertWellFormedTx(builtTx);
    console.log(`✅ ${chain.toUpperCase()} pre-flight well-formed transaction test PASSED.\n`);
  }

  // 3. Test Pre-flight check catching missing fee fields
  console.log('3. Testing Pre-flight Check Rejection for Malformed Transaction...');
  const malformedTx: any = {
    id: 'malformed-1',
    chain: 'robinhood',
    contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
    walletAddress: testAccount.address,
    quantity: 1,
    rawPayload: {
      account: testAccount.address,
      to: '0x1234567890abcdef1234567890abcdef12345678',
      data: '0x',
      value: BigInt(0),
    },
    isSigned: false,
    createdAt: Date.now(),
  };

  try {
    SecurityGuard.assertWellFormedTx(malformedTx);
    throw new Error('❌ Pre-flight check failed to catch malformed transaction!');
  } catch (err: any) {
    if (err.message.includes('MALFORMED TRANSACTION')) {
      console.log('✅ SecurityGuard successfully caught malformed transaction:', err.message);
    } else {
      throw err;
    }
  }

  console.log('\n🎉 ALL EIP-1559 FEE ESTIMATION & TX BUILDING TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testFeeEstimationAndTxBuilding().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
