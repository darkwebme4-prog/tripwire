import dotenv from 'dotenv';
import { SEADROP_V1_ABI, CANONICAL_SEADROP_CONTRACT } from './chains/seadrop.js';
import { createPublicClient, http, Hex, parseEther } from 'viem';
import { robinhoodChain } from './chains/evm.js';

dotenv.config();

async function findAllowedFeeRecipient() {
  console.log('=== TESTING CANDIDATE FEE RECIPIENTS ===\n');

  const rpcUrl = process.env.ROBINHOOD_RPC_ALCHEMY || 'https://robinhood-mainnet.g.alchemy.com/v2/alch_pdxKqyA7lMlNd9IrtXxNu';
  const client = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });

  const nftContract: Hex = '0x84d8fba1f41156fae5147f2563d52ef7b31b899d';
  const seaDropContract: Hex = CANONICAL_SEADROP_CONTRACT;
  const userAddress: Hex = '0x8DF529eEFCA5DDE0D71474A7a6063022D0031BBd';

  const candidates: Hex[] = [
    '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC', // OpenSea SeaDrop Fee Recipient
    '0x2aAe5F425E2Fa8577Cb4251D0582b68b2E009BBe', // NFT Contract Owner
    '0x0000000000000000000000000000000000000000',
  ];

  for (const feeRecipient of candidates) {
    console.log(`\nTesting feeRecipient: ${feeRecipient}...`);
    try {
      const { result } = await client.simulateContract({
        account: userAddress,
        address: seaDropContract,
        abi: SEADROP_V1_ABI,
        functionName: 'mintPublic',
        args: [nftContract, feeRecipient, userAddress, BigInt(1)],
        value: parseEther('0.0005'),
      });
      console.log('🎉 SUCCESS! Simulation passed cleanly for feeRecipient:', feeRecipient);
      console.log('Result:', result);
      process.exit(0);
    } catch (err: any) {
      console.log('❌ Reverted:', err.shortMessage || err.message);
      if (err.data || err.cause?.data) {
        console.log('   Raw Revert Data:', err.data || err.cause?.data);
      }
    }
  }

  // Search recent 10 blocks for contract creation / logs
  const latestBlock = await client.getBlockNumber();
  console.log('\nLatest block number:', latestBlock.toString());

  try {
    const logs = await client.getLogs({
      address: seaDropContract,
      fromBlock: latestBlock - BigInt(9),
      toBlock: latestBlock,
    });
    console.log(`Logs in last 10 blocks: ${logs.length}`);
  } catch (err: any) {
    console.log('Logs query error:', err.message);
  }

  process.exit(0);
}

findAllowedFeeRecipient().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
