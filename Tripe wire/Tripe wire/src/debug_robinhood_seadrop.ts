import dotenv from 'dotenv';
import { EvmChainAdapter } from './chains/evm.js';
import { SEADROP_V1_ABI, CANONICAL_SEADROP_CONTRACT, SeaDropInspector } from './chains/seadrop.js';
import { WalletManager } from './core/walletManager.js';
import { createPublicClient, http, Hex, formatEther } from 'viem';
import { robinhoodChain } from './chains/evm.js';

dotenv.config();

async function debugRobinhoodSeaDrop() {
  console.log('=== DEBUGGING ROBINHOOD SEADROP MINT REVERT ===\n');

  const contractAddress: Hex = '0x84d8fba1f41156fae5147f2563d52ef7b31b899d';
  const adapter = new EvmChainAdapter('robinhood');

  const rpcUrl = process.env.ROBINHOOD_RPC_ALCHEMY || 'https://robinhood-mainnet.g.alchemy.com/v2/alch_pdxKqyA7lMlNd9IrtXxNu';
  const client = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });

  console.log('1. Checking getSeaDrop() on NFT contract...');
  const seaDropAddr = await adapter.resolveSeaDropContractAddress(contractAddress);
  console.log('Resolved SeaDrop Contract Address:', seaDropAddr);

  console.log('\n2. Calling getPublicDrop() on SeaDrop contract...');
  try {
    const publicDropRaw: any = await client.readContract({
      address: seaDropAddr,
      abi: SEADROP_V1_ABI,
      functionName: 'getPublicDrop',
      args: [contractAddress],
    });
    console.log('Raw getPublicDrop Output:', publicDropRaw);

    let mintPrice = BigInt(0);
    let startTime = 0;
    let endTime = 0;
    let maxTotalMintableByWallet = 0;
    let feeBps = 0;
    let restrictFeeRecipients = false;

    if (Array.isArray(publicDropRaw)) {
      mintPrice = BigInt(publicDropRaw[0] || 0);
      startTime = Number(publicDropRaw[1] || 0);
      endTime = Number(publicDropRaw[2] || 0);
      maxTotalMintableByWallet = Number(publicDropRaw[3] || 0);
      feeBps = Number(publicDropRaw[4] || 0);
      restrictFeeRecipients = Boolean(publicDropRaw[5]);
    } else if (typeof publicDropRaw === 'object') {
      mintPrice = BigInt(publicDropRaw.mintPrice || 0);
      startTime = Number(publicDropRaw.startTime || 0);
      endTime = Number(publicDropRaw.endTime || 0);
      maxTotalMintableByWallet = Number(publicDropRaw.maxTotalMintableByWallet || 0);
      feeBps = Number(publicDropRaw.feeBps || 0);
      restrictFeeRecipients = Boolean(publicDropRaw.restrictFeeRecipients);
    }

    console.log('Parsed Public Drop Parameters:');
    console.log('  mintPrice:                ', mintPrice.toString(), `(${formatEther(mintPrice)} ETH)`);
    console.log('  startTime:                ', startTime, startTime ? new Date(startTime * 1000).toISOString() : '0 (Immediate)');
    console.log('  endTime:                  ', endTime, endTime ? new Date(endTime * 1000).toISOString() : '0 (No End)');
    console.log('  maxTotalMintableByWallet: ', maxTotalMintableByWallet);
    console.log('  feeBps:                   ', feeBps);
    console.log('  restrictFeeRecipients:    ', restrictFeeRecipients);
  } catch (err: any) {
    console.error('❌ Error calling getPublicDrop:', err.message);
  }

  console.log('\n3. Checking getFeeRecipients() on SeaDrop contract...');
  try {
    const feeRecipients: any = await client.readContract({
      address: seaDropAddr,
      abi: SEADROP_V1_ABI,
      functionName: 'getFeeRecipients',
      args: [contractAddress],
    });
    console.log('Allowed Fee Recipients:', feeRecipients);
  } catch (err: any) {
    console.log('getFeeRecipients call returned:', err.message);
  }

  console.log('\n4. Checking all phases (GTD, WL, Public)...');
  const summary = await SeaDropInspector.inspectAllPhases(client, contractAddress);
  console.log('Phases Summary:', JSON.stringify(summary, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

  process.exit(0);
}

debugRobinhoodSeaDrop().catch((err) => {
  console.error('Debug script failed:', err);
  process.exit(1);
});
