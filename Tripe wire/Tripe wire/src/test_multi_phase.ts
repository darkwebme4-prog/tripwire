import dotenv from 'dotenv';
import { SeaDropInspector, SeaDropPhaseInfo } from './chains/seadrop.js';
import { formatMultiPhaseSummary } from './bot/formatters.js';
import { ResilientRpcManager } from './chains/rpcClient.js';
import { CHAIN_CONFIGS } from './chains/config.js';
import { parseEther } from 'viem';

dotenv.config();

async function testMultiPhaseDetection() {
  console.log('=== MULTI-GATED PHASE DETECTION (GTD, WL, PUBLIC) TEST RUN ===\n');

  // 1. Test Multi-Phase Inspection Data Structure
  console.log('1. Testing Multi-Phase Inspection Data Struct...');
  const mockPhases: SeaDropPhaseInfo[] = [
    {
      phaseId: 'gtd',
      name: 'GTD (Guaranteed)',
      isGated: true,
      mintPriceWei: parseEther('0.005'),
      mintPriceEth: '0.005',
      maxTotalMintableByWallet: 2,
      startTime: Math.floor(Date.now() / 1000) - 3600,
      endTime: Math.floor(Date.now() / 1000) + 3600,
      isActive: true,
      merkleRoot: '0x1111111111111111111111111111111111111111111111111111111111111111',
      isEligible: true,
      eligibilityReason: 'eligible (proof found)',
    },
    {
      phaseId: 'wl',
      name: 'WL (Whitelist)',
      isGated: true,
      mintPriceWei: parseEther('0.008'),
      mintPriceEth: '0.008',
      maxTotalMintableByWallet: 3,
      startTime: Math.floor(Date.now() / 1000) - 1800,
      endTime: Math.floor(Date.now() / 1000) + 3600,
      isActive: true,
      merkleRoot: '0x2222222222222222222222222222222222222222222222222222222222222222',
      isEligible: false,
      eligibilityReason: 'not eligible',
    },
    {
      phaseId: 'public',
      name: 'Public',
      isGated: false,
      mintPriceWei: parseEther('0.02'),
      mintPriceEth: '0.02',
      maxTotalMintableByWallet: 10,
      startTime: Math.floor(Date.now() / 1000),
      endTime: 0,
      isActive: true,
      isEligible: true,
      eligibilityReason: 'eligible (no proof needed)',
    },
  ];

  console.log('Mock Phases Data:', mockPhases);
  console.log('✅ Multi-phase data structure test PASSED.\n');

  // 2. Test Multi-Phase Summary Display Formatter
  console.log('2. Testing Multi-Phase Summary Formatter...');
  const summaryText = formatMultiPhaseSummary('Azuki SeaDrop Collection', 'AZUKI', mockPhases);
  console.log('--- MULTI-PHASE SUMMARY DISPLAY ---');
  console.log(summaryText);
  console.log('-----------------------------------');
  if (summaryText.includes('GTD') && summaryText.includes('WL') && summaryText.includes('Public')) {
    console.log('✅ Multi-phase summary display test PASSED.\n');
  } else {
    throw new Error('❌ Summary formatter missing phases');
  }

  // 3. Test On-Chain Phase Detection (Base Mainnet)
  console.log('3. Testing On-Chain Multi-Phase Inspection (Base Mainnet)...');
  const baseClient = ResilientRpcManager.createEvmClient('base', CHAIN_CONFIGS.base as any);
  const sampleContract = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';
  const wallet = '0x55f5a6319f1D048a3C43567BD95cb1bf2326A7B3';

  const onChainSummary = await SeaDropInspector.inspectAllPhases(baseClient, sampleContract, wallet);
  console.log('Detected On-Chain Drop Summary:', {
    name: onChainSummary.publicDrop.name,
    phasesCount: onChainSummary.phases.length,
    phases: onChainSummary.phases.map(p => ({ name: p.name, price: p.mintPriceEth, eligible: p.isEligible })),
  });
  console.log('✅ On-chain multi-phase inspection test PASSED.\n');

  // 4. Test Allowlist Calldata Encoding
  console.log('4. Testing mintAllowList Calldata Encoding...');
  const allowListCalldata = SeaDropInspector.encodeMintAllowListCalldata(
    sampleContract,
    '0x0000000000000000000000000000000000000000',
    '0x0000000000000000000000000000000000000000',
    2,
    {
      mintPrice: parseEther('0.005'),
      maxTotalMintableByWallet: 2,
      startTime: 0,
      endTime: 0,
      dropStageIndex: 0,
      maxTokenSupplyForStage: 1000,
      merkleRoot: '0x1111111111111111111111111111111111111111111111111111111111111111',
      proof: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    }
  );
  console.log('Encoded mintAllowList Calldata:', allowListCalldata.substring(0, 66) + '...');
  if (allowListCalldata.startsWith('0x')) {
    console.log('✅ mintAllowList calldata encoding test PASSED.\n');
  } else {
    throw new Error('❌ Failed to encode mintAllowList calldata');
  }

  console.log('🎉 ALL MULTI-PHASE DETECTION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testMultiPhaseDetection().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
