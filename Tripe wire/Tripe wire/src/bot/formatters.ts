import { PublicDropInfo, SeaDropPhaseInfo } from '../chains/seadrop.js';
import { CHAIN_CONFIGS } from '../chains/config.js';
import { SecurityGuard } from '../core/securityGuard.js';
import { SupportedChain } from '../chains/types.js';

export function maskAddress(address: string): string {
  if (!address || address.length < 10) return '***';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

export function sanitizeLogOutput(text: string): string {
  if (!text) return '';
  return text.replace(/0x[a-fA-F0-9]{64}/g, '[REDACTED_PRIVATE_KEY]');
}

export function formatWatchedStatus(contracts: Array<{ contract_address: string; chain: string; status: string; mode?: string }>): string {
  if (contracts.length === 0) {
    return 'ℹ️ <b>No contracts currently monitored.</b>\n\nUse <code>/watch &lt;contract_address&gt; &lt;chain&gt;</code> or tap <b>Add SeaDrop Drop</b> to start monitoring!';
  }

  let text = '📡 <b>Currently Monitored Contracts:</b>\n\n';
  contracts.forEach((c, index) => {
    const statusEmoji = c.status === 'MONITORING' ? '🟢' : c.status === 'MINTED' ? '✅' : '🟡';
    const modeBadge = c.mode === 'AUTO' ? '⚡ AUTO-FIRE' : '🖐️ MANUAL';
    text += `${index + 1}. ${statusEmoji} <code>${maskAddress(c.contract_address)}</code> | <b>${c.chain.toUpperCase()}</b> | Mode: <b>${modeBadge}</b> | State: <code>${c.status}</code>\n`;
  });

  return text;
}

export function formatWalletsList(wallets: Array<{ label: string; chain_type: string; public_address: string }>): string {
  if (wallets.length === 0) {
    return '⚠️ <b>No connected wallets.</b>\n\nTap <b>➕ Add Wallet</b> to connect your wallet via WalletConnect or add your public address for non-custodial minting!';
  }

  let text = '👛 <b>Connected Wallets (Masked Addresses):</b>\n\n';
  wallets.forEach((w, index) => {
    text += `${index + 1}. 🏷️ <b>${w.label}</b> [${w.chain_type}]\n   Address: <code>${maskAddress(w.public_address)}</code>\n`;
  });

  text += '\n🔒 <b>Non-Custodial Guarantee</b>: The bot never holds or signs with main private keys. Auto-fire mode uses ERC-4337 limited-scope, expiring session keys.';
  return text;
}

export function formatMultiPhaseSummary(collectionName: string, symbol: string, phases: SeaDropPhaseInfo[]): string {
  let text = `📋 <b>Phases for ${collectionName} (<code>${symbol}</code>):</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  phases.forEach((p) => {
    const statusIcon = p.isSoldOut ? '🔴' : p.isEligible ? (p.isGated ? '✅' : '🟢') : '❌';
    const priceText = p.mintPriceEth === '0' ? 'FREE' : `${p.mintPriceEth} ETH`;
    const timeText = p.startTime === 0 ? 'Active' : `Starts ${new Date(p.startTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    text += `${statusIcon} <b>${p.name}</b> — ${timeText} — <b>${priceText}</b> — <i>${p.eligibilityReason}</i>\n`;
  });

  return text;
}

export function formatSessionKeyAuthCard(
  contractAddress: string,
  chain: string,
  maxSpendEth: string,
  durationHours: number = 24
): string {
  const config = CHAIN_CONFIGS[chain as keyof typeof CHAIN_CONFIGS];
  const warningBanner = SecurityGuard.getMainnetWarningBanner(chain as SupportedChain);

  return (
    `${warningBanner}\n\n` +
    `🔐 <b>ERC-4337 SESSION KEY AUTHORIZATION</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 <b>Target Contract:</b> <code>${maskAddress(contractAddress)}</code>\n` +
    `🌐 <b>Chain:</b> <b>${config?.name || chain.toUpperCase()}</b>\n` +
    `🎯 <b>Permitted Function:</b> <code>mintPublic</code> ONLY\n` +
    `💰 <b>Max Spend Cap:</b> <b>${maxSpendEth} ${config?.nativeSymbol || 'ETH'}</b>\n` +
    `⏳ <b>Expiration:</b> <b>${durationHours} Hours</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ <b>Security Scoping:</b> This session key is strictly limited to this single contract and function. It will automatically expire in ${durationHours} hours and cannot transfer funds or call other contracts.`
  );
}

export function formatSeaDropSummaryCard(
  drop: PublicDropInfo,
  chain: string,
  quantity: number,
  walletAddress: string,
  gasEth: string,
  gasUsd: string,
  totalEth: string,
  totalUsd: string,
  selectedPhaseName: string = 'Public'
): string {
  const config = CHAIN_CONFIGS[chain as keyof typeof CHAIN_CONFIGS];
  const warningBanner = SecurityGuard.getMainnetWarningBanner(chain as SupportedChain);

  const supplyText = drop.isSoldOut
    ? `🔴 <b>SOLD OUT</b> (${drop.maxSupply.toString()} / ${drop.maxSupply.toString()})`
    : `${drop.totalSupply.toString()} / ${drop.maxSupply.toString()} minted (${drop.remainingSupply.toString()} left)`;

  const activeStatus = drop.isSoldOut
    ? '🔴 SOLD OUT'
    : drop.isActive
    ? '🟢 Active Mint'
    : '🟡 Mint Pending / Paused';

  const priceDisplay = drop.isFree ? '0 ETH (FREE)' : `${drop.mintPriceEth} ETH`;

  return (
    `${warningBanner}\n\n` +
    `💧 <b>SEADROP MINT SUMMARY CARD</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎨 <b>Collection:</b> ${drop.name} (<code>${drop.symbol}</code>)\n` +
    `📊 <b>Supply:</b> ${supplyText}\n` +
    `📍 <b>Contract:</b> <code>${maskAddress(drop.nftContract)}</code>\n` +
    `🌐 <b>Chain:</b> <b>${config.name}</b>\n` +
    `🏷️ <b>Selected Phase:</b> <b>${selectedPhaseName}</b>\n` +
    `⚡ <b>Drop State:</b> ${activeStatus}\n` +
    `📊 <b>Max Mint Per Wallet:</b> ${drop.maxTotalMintableByWallet}\n\n` +
    `💳 <b>MINT BREAKDOWN (${quantity} NFT${quantity > 1 ? 's' : ''}):</b>\n` +
    `• Mint Price: <b>${priceDisplay}</b>\n` +
    `• Estimated Gas Fee: <b>${gasEth} ${config.nativeSymbol}</b> (${gasUsd})\n` +
    `• Total Estimated Cost: <b>${totalEth} ${config.nativeSymbol}</b> (${totalUsd})\n` +
    `• Destination Wallet: <code>${maskAddress(walletAddress)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔐 <b>Non-Custodial Transaction:</b> Tapping <i>Confirm REAL Mainnet Mint</i> will generate an unsigned transaction for approval directly in your wallet.`
  );
}

export function formatTxExplorerLink(chain: string, txHash: string): string {
  const config = CHAIN_CONFIGS[chain as keyof typeof CHAIN_CONFIGS];
  const baseUrl = config?.blockExplorerUrl || 'https://etherscan.io';
  return `${baseUrl}/tx/${txHash}`;
}
