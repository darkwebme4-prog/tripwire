import dotenv from 'dotenv';
import { SEADROP_V1_ABI, CANONICAL_SEADROP_CONTRACT } from './chains/seadrop.js';
import { createPublicClient, http, Hex, parseEther } from 'viem';
import { robinhoodChain } from './chains/evm.js';

dotenv.config();

async function testRobinhoodMintParams() {
  console.log('=== TESTING ROBINHOOD SEADROP MINT PARAMETER COMBINATIONS ===\n');

  const rpcUrl = process.env.ROBINHOOD_RPC_ALCHEMY || 'https://robinhood-mainnet.g.alchemy.com/v2/alch_pdxKqyA7lMlNd9IrtXxNu';
  const client = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });

  const nftContract: Hex = '0x84d8fba1f41156fae5147f2563d52ef7b31b899d';
  const seaDropContract: Hex = CANONICAL_SEADROP_CONTRACT;
  const userAddress: Hex = '0x8DF529eEFCA5DDE0D71474A7a6063022D0031BBd';

  const testCases = [
    {
      name: 'Test 1: feeRecipient=0x0, minterIfNotPayer=0x0',
      feeRecipient: '0x0000000000000000000000000000000000000000' as Hex,
      minterIfNotPayer: '0x0000000000000000000000000000000000000000' as Hex,
    },
    {
      name: 'Test 2: feeRecipient=0x0, minterIfNotPayer=userAddress',
      feeRecipient: '0x0000000000000000000000000000000000000000' as Hex,
      minterIfNotPayer: userAddress,
    },
    {
      name: 'Test 3: feeRecipient=userAddress, minterIfNotPayer=0x0',
      feeRecipient: userAddress,
      minterIfNotPayer: '0x0000000000000000000000000000000000000000' as Hex,
    },
  ];

  for (const tc of testCases) {
    console.log(`\n--- Running ${tc.name} ---`);
    try {
      const { result } = await client.simulateContract({
        account: userAddress,
        address: seaDropContract,
        abi: SEADROP_V1_ABI,
        functionName: 'mintPublic',
        args: [nftContract, tc.feeRecipient, tc.minterIfNotPayer, BigInt(1)],
        value: parseEther('0.0005'),
      });
      console.log(`✅ ${tc.name} PASSED! Result:`, result);
    } catch (err: any) {
      console.log(`❌ ${tc.name} REVERTED:`);
      console.log('   Error Message: ', err.message);
      console.log('   Short Message: ', err.shortMessage);
      console.log('   Raw Error Data:', err.data || err.cause?.data || err.cause?.raw);
      console.log('   Error Signature:', err.signature || err.cause?.signature);
    }
  }

  process.exit(0);
}

testRobinhoodMintParams().catch((err) => {
  console.error('Test script failed:', err);
  process.exit(1);
});
