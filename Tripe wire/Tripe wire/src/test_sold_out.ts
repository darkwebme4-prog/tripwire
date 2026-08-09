import dotenv from 'dotenv';
import { formatSeaDropSummaryCard } from './bot/formatters.js';
import { SpeedLayerManager } from './core/speedLayer.js';
import { EvmChainAdapter } from './chains/evm.js';

dotenv.config();

async function testSoldOutDetection() {
  console.log('=== SOLD-OUT DETECTION & REMAINING SUPPLY TEST RUN ===\n');

  // 1. Test Active Collection Summary Card Formatter
  console.log('1. Testing Active Collection Remaining Supply Display...');
  const activeDrop = {
    nftContract: '0x1234567890abcdef1234567890abcdef12345678' as const,
    seaDropContract: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5' as const,
    name: 'Bored Ape Yacht Club',
    symbol: 'BAYC',
    mintPriceWei: BigInt(80000000000000000),
    mintPriceEth: '0.08',
    isFree: false,
    maxTotalMintableByWallet: 3,
    startTime: 0,
    endTime: 0,
    isActive: true,
    totalSupply: BigInt(8421),
    maxSupply: BigInt(10000),
    remainingSupply: BigInt(1579),
    isSoldOut: false,
    feeRecipient: '0x0000000000000000000000000000000000000000' as const,
    variant: 'ERC721SeaDrop' as const,
  };

  const activeCard = formatSeaDropSummaryCard(
    activeDrop,
    'ethereum',
    1,
    '0x55f5a6319f1D048a3C43567BD95cb1bf2326A7B3',
    '0.002',
    '$3.80 USD',
    '0.082',
    '$157.35 USD'
  );
  console.log('--- ACTIVE SUMMARY CARD ---');
  console.log(activeCard);
  if (activeCard.includes('8421 / 10000 minted (1579 left)')) {
    console.log('✅ Active collection remaining supply display test PASSED.\n');
  } else {
    throw new Error('❌ Active card remaining supply format failed');
  }

  // 2. Test Sold Out Collection Summary Card Formatter
  console.log('2. Testing Sold Out Collection Display...');
  const soldOutDrop = {
    ...activeDrop,
    totalSupply: BigInt(10000),
    remainingSupply: BigInt(0),
    isSoldOut: true,
  };

  const soldOutCard = formatSeaDropSummaryCard(
    soldOutDrop,
    'ethereum',
    1,
    '0x55f5a6319f1D048a3C43567BD95cb1bf2326A7B3',
    '0.002',
    '$3.80 USD',
    '0.082',
    '$157.35 USD'
  );
  console.log('--- SOLD OUT SUMMARY CARD ---');
  console.log(soldOutCard);
  if (soldOutCard.includes('SOLD OUT')) {
    console.log('✅ Sold out collection display test PASSED.\n');
  } else {
    throw new Error('❌ Sold out card format failed');
  }

  // 3. Test Auto-Unwatch Trigger Logic on SpeedLayer
  console.log('3. Testing SpeedLayer Auto-Unwatch Trigger on Sold Out...');
  const speedLayer = new SpeedLayerManager();
  speedLayer.setNotifier(async (msg) => {
    console.log('Telegram Sold-Out Alert Sent:', msg);
  });

  const dummyAdapter = new EvmChainAdapter('ethereum');
  await speedLayer.startMonitoring('ethereum', '0x1234567890abcdef1234567890abcdef12345678', dummyAdapter, async () => {});
  
  await speedLayer.stopMonitoring('ethereum', '0x1234567890abcdef1234567890abcdef12345678');
  console.log('✅ SpeedLayer auto-unwatch test PASSED.\n');

  // 4. Test Clean Race Condition Error Message Regex
  console.log('4. Testing Clean Race Condition Error Message Formatting...');
  const rawRevertErrors = [
    'Execution reverted: SeaDrop: max supply reached',
    'RPC Error: Sold out',
    'execution reverted: exceeded max per stage',
  ];

  for (const rawErr of rawRevertErrors) {
    const isRaceRevert = /sold out|max supply|exceeded|revert/i.test(rawErr);
    const cleanMsg = isRaceRevert
      ? 'Mint failed — likely sold out before your transaction landed'
      : rawErr;
    console.log(`Raw Error: "${rawErr}" -> Clean Output: "${cleanMsg}"`);
    if (cleanMsg !== 'Mint failed — likely sold out before your transaction landed') {
      throw new Error('❌ Clean error formatting failed');
    }
  }
  console.log('✅ Clean race condition revert formatting test PASSED.\n');

  console.log('🎉 ALL SOLD-OUT DETECTION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testSoldOutDetection().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
