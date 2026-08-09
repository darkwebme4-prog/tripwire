import dotenv from 'dotenv';
import { SecurityGuard } from './core/securityGuard.js';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createWalletClient, createPublicClient, http, parseEther, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { CHAIN_CONFIGS } from './chains/config.js';

dotenv.config();

async function testLocalSigningAndSecurityGuard() {
  console.log('=== LOCAL RAW TRANSACTION SIGNING & SECURITY GUARD TEST RUN ===\n');

  // 1. Test SecurityGuard assertion against Hardhat #0 address
  console.log('1. Testing SecurityGuard assertions...');
  const hardhat0Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  try {
    SecurityGuard.assertSafeSigningAccount(hardhat0Address, 'ethereum');
    throw new Error('❌ SecurityGuard failed to block Hardhat #0 address!');
  } catch (err: any) {
    if (err.message.includes('SECURITY ALERT')) {
      console.log('✅ SecurityGuard successfully blocked Hardhat #0 test address:', err.message);
    } else {
      throw err;
    }
  }

  // 2. Test SecurityGuard allowing valid non-test account
  const randomPrivateKey = generatePrivateKey();
  const randomAccount = privateKeyToAccount(randomPrivateKey);
  SecurityGuard.assertSafeSigningAccount(randomAccount.address, 'base');
  console.log(`✅ SecurityGuard approved valid non-test account: ${randomAccount.address}\n`);

  // 3. Test Local Raw Transaction Signing (eth_sendRawTransaction)
  console.log('3. Testing Local Transaction Signing (eth_sendRawTransaction)...');
  const baseClient = createPublicClient({
    chain: base,
    transport: http(CHAIN_CONFIGS.base.providers[0]?.rpcUrl),
  });

  const walletClient = createWalletClient({
    account: randomAccount,
    chain: base,
    transport: http(CHAIN_CONFIGS.base.providers[0]?.rpcUrl),
  });

  const abi = parseAbi(['function mint(uint256 quantity) external payable']);
  const data = encodeFunctionData({
    abi,
    functionName: 'mint',
    args: [BigInt(1)],
  });

  const signedTxHex = await walletClient.signTransaction({
    account: randomAccount,
    chain: base,
    to: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',
    data,
    value: parseEther('0'),
    nonce: 0,
    gas: BigInt(150000),
    maxFeePerGas: parseEther('0.000000002'),
    maxPriorityFeePerGas: parseEther('0.000000001'),
  });

  console.log('Locally Signed Transaction Payload (Raw Hex):', signedTxHex.substring(0, 66) + '...');
  if (signedTxHex.startsWith('0x02')) {
    console.log('✅ Local EIP-1559 transaction signing test PASSED.\n');
  } else {
    throw new Error('❌ Failed to produce valid EIP-1559 signed raw transaction hex');
  }

  console.log('🎉 ALL LOCAL SIGNING & SECURITY GUARD TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testLocalSigningAndSecurityGuard().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
