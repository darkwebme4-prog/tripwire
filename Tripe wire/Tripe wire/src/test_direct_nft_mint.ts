import dotenv from 'dotenv';
import { createPublicClient, http, Hex, parseAbi, parseEther } from 'viem';
import { robinhoodChain } from './chains/evm.js';

dotenv.config();

async function testDirectNftMint() {
  console.log('=== TESTING DIRECT NFT CONTRACT MINT FUNCTIONS ===\n');

  const rpcUrl = process.env.ROBINHOOD_RPC_ALCHEMY || 'https://robinhood-mainnet.g.alchemy.com/v2/alch_pdxKqyA7lMlNd9IrtXxNu';
  const client = createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });

  const nftContract: Hex = '0x84d8fba1f41156fae5147f2563d52ef7b31b899d';
  const userAddress: Hex = '0x8DF529eEFCA5DDE0D71474A7a6063022D0031BBd';

  // 1. Test direct mint(uint256) on NFT contract
  console.log('1. Simulating direct mint(uint256) on NFT contract...');
  try {
    const { result } = await client.simulateContract({
      account: userAddress,
      address: nftContract,
      abi: parseAbi(['function mint(uint256 quantity) external payable']),
      functionName: 'mint',
      args: [BigInt(1)],
      value: parseEther('0.0005'),
    });
    console.log('🎉 DIRECT mint(uint256) PASSED! Result:', result);
  } catch (err: any) {
    console.log('Direct mint(uint256) reverted:', err.shortMessage || err.message);
    if (err.data || err.cause?.data) {
      console.log('Raw data:', err.data || err.cause?.data);
    }
  }

  // 2. Test direct mintPublic(uint256) on NFT contract
  console.log('\n2. Simulating direct mintPublic(uint256) on NFT contract...');
  try {
    const { result } = await client.simulateContract({
      account: userAddress,
      address: nftContract,
      abi: parseAbi(['function mintPublic(uint256 quantity) external payable']),
      functionName: 'mintPublic',
      args: [BigInt(1)],
      value: parseEther('0.0005'),
    });
    console.log('🎉 DIRECT mintPublic(uint256) PASSED! Result:', result);
  } catch (err: any) {
    console.log('Direct mintPublic(uint256) reverted:', err.shortMessage || err.message);
    if (err.data || err.cause?.data) {
      console.log('Raw data:', err.data || err.cause?.data);
    }
  }

  process.exit(0);
}

testDirectNftMint().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
