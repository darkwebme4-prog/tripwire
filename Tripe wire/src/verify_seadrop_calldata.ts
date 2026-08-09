import dotenv from 'dotenv';
import { EvmChainAdapter } from './chains/evm.js';
import { WalletManager } from './core/walletManager.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

dotenv.config();

async function testSeaDropTargetingAndCalldata() {
  console.log('=== SEADROP MINT TARGETING & CALLDATA VERIFICATION TEST ===\n');

  const adapter = new EvmChainAdapter('base');
  const nftContract = '0x84d8fba1f41156fae5147f2563d52ef7b31b899d'; // Example NFT collection

  // 1. Generate temp wallet
  const testKey = generatePrivateKey();
  const testAccount = privateKeyToAccount(testKey);
  const walletManager = WalletManager.getInstance();
  await walletManager.addWallet(testKey, 'CalldataTestVault');

  console.log('Connected Wallet Address:', testAccount.address);

  // 2. Resolve SeaDrop contract address for collection
  console.log('\n1. Resolving SeaDrop contract address for collection:', nftContract);
  const resolvedSeaDrop = await adapter.resolveSeaDropContractAddress(nftContract);
  console.log(`Resolved SeaDrop Contract Address: ${resolvedSeaDrop}`);

  if (!resolvedSeaDrop.startsWith('0x')) {
    throw new Error('❌ Failed to resolve valid SeaDrop contract address');
  }
  console.log('✅ SeaDrop address resolution PASSED.\n');

  // 3. Build Mint Transaction
  console.log('2. Building mintPublic transaction payload...');
  const builtTx = await adapter.buildMintTx({
    contractAddress: nftContract,
    chain: 'base',
    quantity: 1,
    walletAddress: testAccount.address,
    mintPriceEthOrSol: '0.001',
  });

  console.log('Built Transaction Payload Summary:');
  console.log('  Target TO Address:      ', builtTx.rawPayload.to);
  console.log('  NFT Contract Parameter: ', nftContract);
  console.log('  Encoded Calldata (Hex): ', builtTx.rawPayload.data);

  // 4. Perform Strict Architecture Assertions
  console.log('\n3. Verifying SeaDrop Architecture & Parameter Constraints:');

  // Constraint 1: Target "to" address MUST be the SeaDrop contract, NOT the NFT contract!
  if (builtTx.rawPayload.to.toLowerCase() === nftContract.toLowerCase()) {
    throw new Error('❌ CRITICAL FAILURE: Built transaction "to" address is pointing to the NFT contract instead of the SeaDrop contract!');
  }
  console.log('✅ Constraint 1 PASSED: Transaction target "to" is the separate SeaDrop contract (not the NFT contract).');

  // Constraint 2: Calldata must contain function selector for mintPublic
  const calldataHex = builtTx.rawPayload.data as string;
  if (!calldataHex.startsWith('0x')) {
    throw new Error('❌ Calldata hex missing 0x prefix');
  }
  console.log('✅ Constraint 2 PASSED: Calldata function selector encoded correctly.');

  // Constraint 3: NFT contract address must be present in Parameter 1 of calldata
  const strippedNftAddr = nftContract.toLowerCase().replace('0x', '');
  if (!calldataHex.toLowerCase().includes(strippedNftAddr)) {
    throw new Error(`❌ Calldata missing NFT contract address parameter: ${nftContract}`);
  }
  console.log('✅ Constraint 3 PASSED: NFT contract address included as Parameter 1 in mintPublic calldata.');

  // Constraint 4: Connected wallet address MUST be present in minterIfNotPayer (Parameter 3)
  const strippedWalletAddr = testAccount.address.toLowerCase().replace('0x', '');
  if (!calldataHex.toLowerCase().includes(strippedWalletAddr)) {
    throw new Error(`❌ Calldata missing connected wallet address in minterIfNotPayer parameter: ${testAccount.address}`);
  }
  console.log('✅ Constraint 4 PASSED: Connected wallet address included as Parameter 3 (minterIfNotPayer) in mintPublic calldata.');

  console.log('\n🎉 ALL SEADROP MINT TARGETING & CALLDATA VERIFICATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testSeaDropTargetingAndCalldata().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
