import dotenv from 'dotenv';
import { createPublicClient, http, Hex, parseAbi } from 'viem';
import { robinhoodChain } from './chains/evm.js';

dotenv.config();

async function inspectNftContractViews() {
  console.log('=== INSPECTING NFT CONTRACT VIEWS ===\n');

  const rpcUrl = process.env.ROBINHOOD_RPC_ALCHEMY || 'https://robinhood-mainnet.g.alchemy.com/v2/alch_pdxKqyA7lMlNd9IrtXxNu';
  const client = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });

  const nftContract: Hex = '0x84d8fba1f41156fae5147f2563d52ef7b31b899d';
  const seaDropContract: Hex = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';

  const viewFunctions = [
    'function getFeeRecipients() view returns (address[])',
    'function feeRecipient() view returns (address)',
    'function getFeeRecipient() view returns (address)',
    'function allowedFeeRecipients() view returns (address[])',
    'function getPublicDrop() view returns ((uint80,uint48,uint48,uint16,uint16,bool))',
    'function getMintStats(address) view returns (uint256, uint256, uint256)',
    'function getSeaDrop() view returns (address)',
  ];

  for (const fn of viewFunctions) {
    try {
      const fnName = fn.split(' ')[1].split('(')[0];
      const hasArg = fn.includes('(address)');
      const res = await client.readContract({
        address: nftContract,
        abi: parseAbi([fn]),
        functionName: fnName,
        args: hasArg ? [seaDropContract] : undefined,
      });
      console.log(`✅ NFT Contract ${fnName}:`, res);
    } catch (err: any) {
      console.log(`❌ NFT Contract ${fn}: ${err.shortMessage || err.message}`);
    }
  }

  for (const fn of viewFunctions) {
    try {
      const fnName = fn.split(' ')[1].split('(')[0];
      const hasArg = fn.includes('(address)');
      const res = await client.readContract({
        address: seaDropContract,
        abi: parseAbi([fn]),
        functionName: fnName,
        args: hasArg ? [nftContract] : undefined,
      });
      console.log(`✅ SeaDrop Contract ${fnName}:`, res);
    } catch (err: any) {
      console.log(`❌ SeaDrop Contract ${fn}: ${err.shortMessage || err.message}`);
    }
  }

  process.exit(0);
}

inspectNftContractViews().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
