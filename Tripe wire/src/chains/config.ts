import dotenv from 'dotenv';
import { SupportedChain } from './types.js';

dotenv.config();

export interface RpcProviderConfig {
  name: string; // E.g. 'ALCHEMY', 'QUICKNODE', 'ANKR', 'HELIUS'
  rpcUrl: string;
  wsUrl?: string;
  supportsWs: boolean;
}

export interface ChainConfig {
  name: string;
  chain: SupportedChain;
  chainId?: number;
  isEvm: boolean;
  nativeSymbol: string;
  blockExplorerUrl: string;
  isFifoOnly?: boolean;
  supportsEip1559?: boolean;
  supportsFlashbots?: boolean;
  providers: RpcProviderConfig[];
}

function parseProviders(chainKey: string, isEvm: boolean): RpcProviderConfig[] {
  const providers: RpcProviderConfig[] = [];

  const rawProviders = isEvm
    ? [
        { name: 'ALCHEMY', envVar: `${chainKey}_RPC_ALCHEMY`, legacyEnv: `${chainKey}_RPC_URL` },
        { name: 'QUICKNODE', envVar: `${chainKey}_RPC_QUICKNODE` },
        { name: 'ANKR', envVar: `${chainKey}_RPC_ANKR` },
      ]
    : [
        { name: 'HELIUS', envVar: 'SOLANA_RPC_HELIUS' },
        { name: 'ANKR', envVar: 'SOLANA_RPC_ANKR', legacyEnv: 'SOLANA_RPC_URL' },
        { name: 'ALCHEMY', envVar: 'SOLANA_RPC_ALCHEMY' },
      ];

  for (const p of rawProviders) {
    const rpcUrl = process.env[p.envVar]?.trim() || (p.legacyEnv ? process.env[p.legacyEnv]?.trim() : '');
    if (rpcUrl && rpcUrl.length > 0) {
      let wsUrl: string | undefined;
      let supportsWs = false;

      // Only Alchemy and QuickNode (or explicit wss://) are marked for WebSocket subscriptions
      if (p.name === 'ALCHEMY' || p.name === 'QUICKNODE' || rpcUrl.startsWith('wss://')) {
        supportsWs = true;
        wsUrl = rpcUrl.startsWith('https://') ? rpcUrl.replace('https://', 'wss://') : rpcUrl;
      }

      providers.push({
        name: p.name,
        rpcUrl,
        wsUrl,
        supportsWs,
      });
    }
  }

  // Fallback defaults if no environment variables are defined
  if (providers.length === 0) {
    if (chainKey === 'ETHEREUM') {
      providers.push({ name: 'PUBLIC_DEFAULT', rpcUrl: 'https://cloudflare-eth.com', supportsWs: false });
    } else if (chainKey === 'BASE') {
      providers.push({ name: 'PUBLIC_DEFAULT', rpcUrl: 'https://mainnet.base.org', supportsWs: false });
    } else if (chainKey === 'ARBITRUM') {
      providers.push({ name: 'PUBLIC_DEFAULT', rpcUrl: 'https://arb1.arbitrum.io/rpc', supportsWs: false });
    } else if (chainKey === 'ROBINHOOD') {
      providers.push({ name: 'PUBLIC_DEFAULT', rpcUrl: 'https://robinhood-mainnet.g.alchemy.com/v2/demo', supportsWs: false });
    } else if (!isEvm) {
      providers.push({ name: 'PUBLIC_DEFAULT', rpcUrl: 'https://api.mainnet-beta.solana.com', supportsWs: false });
    }
  }

  return providers;
}

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  ethereum: {
    name: 'Ethereum Mainnet',
    chain: 'ethereum',
    chainId: 1,
    isEvm: true,
    nativeSymbol: 'ETH',
    blockExplorerUrl: 'https://etherscan.io',
    supportsEip1559: true,
    supportsFlashbots: true,
    providers: parseProviders('ETHEREUM', true),
  },
  base: {
    name: 'Base Mainnet',
    chain: 'base',
    chainId: 8453,
    isEvm: true,
    nativeSymbol: 'ETH',
    blockExplorerUrl: 'https://basescan.org',
    supportsEip1559: true,
    supportsFlashbots: false,
    providers: parseProviders('BASE', true),
  },
  arbitrum: {
    name: 'Arbitrum One',
    chain: 'arbitrum',
    chainId: 42161,
    isEvm: true,
    nativeSymbol: 'ETH',
    blockExplorerUrl: 'https://arbiscan.io',
    supportsEip1559: true,
    supportsFlashbots: false,
    providers: parseProviders('ARBITRUM', true),
  },
  robinhood: {
    name: 'Robinhood Chain',
    chain: 'robinhood',
    chainId: 4663,
    isEvm: true,
    nativeSymbol: 'ETH',
    blockExplorerUrl: 'https://explorer.robinhood.com',
    isFifoOnly: true, // Strict first-come-first-served ordering
    supportsEip1559: false,
    supportsFlashbots: false,
    providers: parseProviders('ROBINHOOD', true),
  },
  solana: {
    name: 'Solana',
    chain: 'solana',
    isEvm: false,
    nativeSymbol: 'SOL',
    blockExplorerUrl: 'https://solscan.io',
    supportsEip1559: false,
    supportsFlashbots: false,
    providers: parseProviders('SOLANA', false),
  },
};
