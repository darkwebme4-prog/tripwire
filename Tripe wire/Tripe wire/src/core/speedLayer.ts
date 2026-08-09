import { ChainAdapter, SupportedChain } from '../chains/types.js';
import { SeaDropInspector } from '../chains/seadrop.js';
import { ResilientRpcManager } from '../chains/rpcClient.js';
import { CHAIN_CONFIGS } from '../chains/config.js';
import pino from 'pino';

const logger = pino({ name: 'SpeedLayer' });

export type TriggerCallback = (event: {
  contractAddress: string;
  chain: SupportedChain;
  timestamp: number;
  blockNumber?: bigint;
}) => Promise<void>;

export interface ActiveWatch {
  chain: SupportedChain;
  contractAddress: string;
  callback: TriggerCallback;
  unsubscribe?: () => void;
  pollInterval?: NodeJS.Timeout;
}

export class SpeedLayerManager {
  private activeWatches: Map<string, ActiveWatch> = new Map();
  private telegramNotifier?: (message: string) => Promise<void>;

  public setNotifier(notifier: (message: string) => Promise<void>): void {
    this.telegramNotifier = notifier;
  }

  /**
   * Starts monitoring a contract via WebSocket speed layer + HTTP poll backup
   */
  public async startMonitoring(
    chain: SupportedChain,
    contractAddress: string,
    adapter: ChainAdapter,
    callback: TriggerCallback
  ): Promise<void> {
    const key = `${chain.toLowerCase()}:${contractAddress.toLowerCase()}`;

    if (this.activeWatches.has(key)) {
      logger.info({ key }, 'Contract is already being monitored');
      return;
    }

    const watch: ActiveWatch = {
      chain,
      contractAddress,
      callback,
    };

    // 1. WebSocket Event Listening
    if (adapter.subscribeMintEvents) {
      const unsubscribeWs = adapter.subscribeMintEvents(contractAddress, async (log: any) => {
        logger.info({ chain, contractAddress, blockNumber: log?.blockNumber }, 'WebSocket Speed Layer event triggered!');
        await callback({
          contractAddress,
          chain,
          timestamp: Date.now(),
          blockNumber: log?.blockNumber,
        });
      });
      watch.unsubscribe = unsubscribeWs;
    }

    // 2. Poll Backup + Sold-Out Checker
    const pollInterval = setInterval(async () => {
      try {
        const config = CHAIN_CONFIGS[chain];
        const client = ResilientRpcManager.createEvmClient(chain, config as any);
        const dropInfo = await SeaDropInspector.inspectSeaDropContract(client, contractAddress as `0x${string}`);

        if (dropInfo.isSoldOut) {
          logger.warn({ chain, contractAddress }, 'Contract is SOLD OUT! Stopping watch.');
          await this.stopMonitoring(chain, contractAddress);
          if (this.telegramNotifier) {
            await this.telegramNotifier(
              `⚠️ <b>${dropInfo.name}</b> (<code>${contractAddress.substring(0, 6)}...</code>) is now <b>SOLD OUT</b> — ending watch.`
            );
          }
          return;
        }

        if (dropInfo.isActive) {
          logger.info({ chain, contractAddress }, 'State flip detected via HTTP polling!');
          await callback({
            contractAddress,
            chain,
            timestamp: Date.now(),
          });
        }
      } catch (err: any) {
        logger.debug({ chain, contractAddress, error: err.message }, 'Polling check error');
      }
    }, 5000);

    watch.pollInterval = pollInterval;
    this.activeWatches.set(key, watch);
    logger.info({ key }, 'Started speed layer monitoring (WebSocket + HTTP fallback + Sold-Out tracker)');
  }

  /**
   * Stop monitoring a contract
   */
  public async stopMonitoring(chain: SupportedChain, contractAddress: string): Promise<boolean> {
    const key = `${chain.toLowerCase()}:${contractAddress.toLowerCase()}`;
    const watch = this.activeWatches.get(key);
    if (!watch) return false;

    if (watch.unsubscribe) {
      try {
        watch.unsubscribe();
      } catch (err: any) {
        logger.warn({ error: err.message }, 'Error unsubscribing WebSocket listener');
      }
    }

    if (watch.pollInterval) {
      clearInterval(watch.pollInterval);
    }

    this.activeWatches.delete(key);
    logger.info({ key }, 'Stopped speed layer monitoring');
    return true;
  }
}
