import dotenv from 'dotenv';
import { createPublicClient, http, Hex, parseAbi } from 'viem';
import { robinhoodChain } from './chains/evm.js';

dotenv.config();

async function checkWalletBalance() {
  console.log('=== CHECKING WALLET BALANCE & MINT STATS ===\n');

  const rpcUrl = process.env.ROBINHOOD_RPC_ALCHEMY || 'https://robinhood-mainnet.g.alchemy.com/v2/alch_pdxKqyA7lMlNd9IrtXxNu';
  const client = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });

  const nftContract: Hex = '0x84d8fba1f41156fae5147f2563d52ef7b31b899d';
  const walletAddress: Hex = '0x8DF529eEFCA5DDE0D71474A7a6063022D0031BBd';

  try {
    const balance = (await client.readContract({
      address: nftContract,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [walletAddress],
    })) as bigint;
    console.log(`balanceOf(${walletAddress}):`, balance.toString());
  } catch (err: any) {
    console.log('balanceOf error:', err.message);
  }

  try {
    const stats: any = await client.readContract({
      address: nftContract,
      abi: parseAbi(['function getMintStats(address) view returns (uint256, uint256, uint256)']),
      functionName: 'getMintStats',
      args: [walletAddress],
    });
    console.log(`getMintStats(${walletAddress}):`, stats);
    console.log('  Minter Total Minted: ', stats[0].toString());
    console.log('  Current Total Supply:', stats[1].toString());
    console.log('  Max Token Supply:    ', stats[2].toString());
  } catch (err: any) {
    console.log('getMintStats error:', err.message);
  }

  process.exit(0);
}

checkWalletBalance().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
