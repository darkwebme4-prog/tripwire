import { createPublicClient, http, fallback, PublicClient, Chain } from 'viem';
import { Connection } from '@solana/web3.js';
import { CHAIN_CONFIGS, RpcProviderConfig } from './config.js';
import { SupportedChain } from './types.js';
import pino from 'pino';

const logger = pino({ name: 'RpcClient' });

export class ResilientRpcManager {
  /**
   * Creates a Viem PublicClient equipped with fallback transport across all configured providers
   */
  public static createEvmClient(chain: SupportedChain, viemChain: Chain): PublicClient<any, any> {
    const config = CHAIN_CONFIGS[chain];
    const providers = config.providers;

    if (providers.length === 0) {
      throw new Error(`No RPC providers configured for chain '${chain}'`);
    }

    // Build Viem HTTP transports with provider failure logging
    const transports = providers.map((p) => {
      return http(p.rpcUrl, {
        name: p.name,
        retryCount: 2,
        timeout: 5000,
        onFetchRequest(request) {
          logger.debug({ chain, provider: p.name }, `Executing RPC request via ${p.name}`);
        },
        onFetchResponse(response) {
          if (!response.ok) {
            logger.warn({ chain, provider: p.name, status: response.status }, `RPC provider '${p.name}' returned non-200 HTTP status`);
          }
        },
      });
    });

    // Create Viem client with fallback transport
    return createPublicClient({
      chain: viemChain,
      transport: fallback(transports, {
        rank: false,
      }),
    }) as PublicClient<any, any>;
  }

  /**
   * Executes a fallback query across Solana RPC providers
   */
  public static async executeSolanaFallback<T>(
    operation: (connection: Connection, providerName: string) => Promise<T>
  ): Promise<T> {
    const config = CHAIN_CONFIGS.solana;
    const providers = config.providers;
    let lastError: any;

    for (const p of providers) {
      try {
        const connection = new Connection(p.rpcUrl, { commitment: 'confirmed' });
        const result = await operation(connection, p.name);
        return result;
      } catch (err: any) {
        lastError = err;
        logger.warn({ chain: 'solana', provider: p.name, error: err.message }, `Solana RPC provider '${p.name}' failed. Retrying with next provider...`);
      }
    }

    throw new Error(`All Solana RPC providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Startup Health-Check function pings each configured provider per chain and logs status by provider name only.
   */
  public static async checkRpcHealth(): Promise<void> {
    logger.info('🔍 Performing Startup RPC Provider Health Check across all chains...');

    for (const chainKey of Object.keys(CHAIN_CONFIGS) as SupportedChain[]) {
      const config = CHAIN_CONFIGS[chainKey];

      for (const provider of config.providers) {
        try {
          if (config.isEvm) {
            const tempClient = createPublicClient({
              chain: undefined,
              transport: http(provider.rpcUrl, { timeout: 4000 }),
            });
            const blockNumber = await tempClient.getBlockNumber();
            logger.info(
              `[${config.name}] ${provider.name}: 🟢 Healthy (Block #${blockNumber.toString()}) | WSS: ${provider.supportsWs ? 'Active' : 'N/A'}`
            );
          } else {
            const connection = new Connection(provider.rpcUrl, { commitment: 'confirmed' });
            const slot = await connection.getSlot();
            logger.info(
              `[${config.name}] ${provider.name}: 🟢 Healthy (Slot #${slot}) | WSS: ${provider.supportsWs ? 'Active' : 'N/A'}`
            );
          }
        } catch (err: any) {
          logger.error(
            `[${config.name}] ${provider.name}: 🔴 Unreachable / Bad Key (Error: ${err.message || 'Timeout'})`
          );
        }
      }
    }

    logger.info('✅ Startup RPC Health Check completed.\n');
  }
}
