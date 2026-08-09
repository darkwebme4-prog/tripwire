import { CHAIN_CONFIGS } from './config.js';
import { SupportedChain } from './types.js';
import { createPublicClient, http } from 'viem';
import { Connection } from '@solana/web3.js';

export interface ChainLatencyInfo {
  chain: SupportedChain;
  name: string;
  latencyMs: number;
  isHealthy: boolean;
}

export class RpcLatencyMonitor {
  /**
   * Measures latency for a specific chain
   */
  public static async measureChainLatency(chain: SupportedChain): Promise<ChainLatencyInfo> {
    const config = CHAIN_CONFIGS[chain];
    const provider = config.providers[0];
    if (!provider) {
      return { chain, name: config.name, latencyMs: -1, isHealthy: false };
    }

    const start = Date.now();
    try {
      if (config.isEvm) {
        const client = createPublicClient({
          transport: http(provider.rpcUrl, { timeout: 3000 }),
        });
        await client.getBlockNumber();
      } else {
        const connection = new Connection(provider.rpcUrl, { commitment: 'confirmed' });
        await connection.getSlot();
      }
      const latencyMs = Date.now() - start;
      return { chain, name: config.name, latencyMs, isHealthy: true };
    } catch {
      return { chain, name: config.name, latencyMs: -1, isHealthy: false };
    }
  }

  /**
   * Returns a formatted status row for display in Telegram UI
   * Example: "Base: 45ms 🟢 | Ethereum: 110ms 🟢 | Arbitrum: 52ms 🟢 | Robinhood: 65ms 🟢 | Solana: 120ms 🟢"
   */
  public static async getFormattedLatencyRow(): Promise<string> {
    const chains: SupportedChain[] = ['ethereum', 'base', 'arbitrum', 'robinhood', 'solana'];
    const results = await Promise.all(chains.map((c) => this.measureChainLatency(c)));

    const parts = results.map((r) => {
      if (!r.isHealthy || r.latencyMs < 0) {
        return `<b>${r.name.split(' ')[0]}</b>: 🔴 Offline`;
      }
      const statusEmoji = r.latencyMs < 100 ? '🟢' : r.latencyMs < 300 ? '🟡' : '🔴';
      return `<b>${r.name.split(' ')[0]}</b>: ${r.latencyMs}ms ${statusEmoji}`;
    });

    return parts.join(' | ');
  }
}
