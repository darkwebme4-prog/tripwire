import { ChainAdapter, MintParams, SupportedChain, TxResult } from '../chains/types.js';
import { SpeedLayerManager } from './speedLayer.js';
import { TxBuilderCache } from './txBuilder.js';
import { Repository, WatchedContractRecord } from '../db/repository.js';
import { SessionKeyManager } from './sessionKeyManager.js';
import { formatTxExplorerLink, maskAddress } from '../bot/formatters.js';
import pino from 'pino';

const logger = pino({ name: 'MintQueue' });

export interface QueuedMintJob {
  id: number;
  contractAddress: string;
  chain: SupportedChain;
  walletAddress: string;
  quantity: number;
  status: 'QUEUED' | 'EXECUTING' | 'SUCCESS' | 'FAILED';
  createdAt: number;
}

export class MintQueueManager {
  private static instance: MintQueueManager;
  private adapters: Map<SupportedChain, ChainAdapter> = new Map();
  private speedLayer: SpeedLayerManager = new SpeedLayerManager();
  private txCache: TxBuilderCache = TxBuilderCache.getInstance();
  private sessionKeyManager = SessionKeyManager.getInstance();
  private pendingJobs: Map<string, QueuedMintJob[]> = new Map();
  private telegramNotifier?: (chatId: number | string, message: string, extra?: any) => Promise<void>;

  private constructor() {
    this.speedLayer.setNotifier(async (msg: string) => {
      if (this.telegramNotifier) {
        await this.telegramNotifier('CHAT_ID', msg, { parse_mode: 'HTML' });
      }
    });
  }

  public static getInstance(): MintQueueManager {
    if (!MintQueueManager.instance) {
      MintQueueManager.instance = new MintQueueManager();
    }
    return MintQueueManager.instance;
  }

  public setNotifier(notifier: (chatId: number | string, message: string, extra?: any) => Promise<void>): void {
    this.telegramNotifier = notifier;
  }

  public registerAdapter(adapter: ChainAdapter): void {
    this.adapters.set(adapter.chain, adapter);
    logger.info({ chain: adapter.chain }, 'Registered chain adapter');
  }

  public getAdapter(chain: SupportedChain): ChainAdapter {
    const adapter = this.adapters.get(chain);
    if (!adapter) {
      throw new Error(`Chain adapter for '${chain}' is not registered`);
    }
    return adapter;
  }

  /**
   * Watch contract on chain with mode selection ('MANUAL' or 'AUTO')
   */
  public async watchContract(
    contractAddress: string,
    chain: SupportedChain,
    mode: 'MANUAL' | 'AUTO' = 'MANUAL',
    sessionKeyId?: string
  ): Promise<WatchedContractRecord> {
    const adapter = this.getAdapter(chain);
    const record = await Repository.addWatchedContract(contractAddress, chain, mode, sessionKeyId);

    await this.speedLayer.startMonitoring(chain, contractAddress, adapter, async (event) => {
      logger.info({ event, mode }, 'WebSocket trigger event received!');
      await this.handleTriggerEvent(chain, contractAddress, mode, sessionKeyId);
    });

    return record;
  }

  public async unwatchContract(contractAddress: string): Promise<boolean> {
    const contracts = await Repository.getWatchedContracts();
    const target = contracts.find(c => c.contract_address.toLowerCase() === contractAddress.toLowerCase());
    if (!target) return false;

    const chain = target.chain as SupportedChain;
    await this.speedLayer.stopMonitoring(chain, contractAddress);
    return await Repository.removeWatchedContract(contractAddress);
  }

  /**
   * Queue a mint job and pre-build transaction
   */
  public async queueMint(
    contractAddress: string,
    chain: SupportedChain,
    quantity: number,
    walletAddress: string
  ): Promise<{ jobId: number; prebuilt: boolean }> {
    const adapter = this.getAdapter(chain);
    const params: MintParams = { contractAddress, chain, quantity, walletAddress };

    const jobId = await Repository.recordMintJob(contractAddress, chain, walletAddress, quantity);

    let prebuilt = false;
    try {
      await this.txCache.prebuildAndCache(adapter, params);
      prebuilt = true;
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Prebuild warning: transaction will build live on trigger');
    }

    const key = `${chain.toLowerCase()}:${contractAddress.toLowerCase()}`;
    const jobs = this.pendingJobs.get(key) || [];
    const job: QueuedMintJob = {
      id: jobId,
      contractAddress,
      chain,
      walletAddress,
      quantity,
      status: 'QUEUED',
      createdAt: Date.now(),
    };
    jobs.push(job);
    this.pendingJobs.set(key, jobs);

    return { jobId, prebuilt };
  }

  /**
   * Handles WebSocket trigger event for MANUAL vs AUTO mode with decoded contract error messages
   */
  private async handleTriggerEvent(
    chain: SupportedChain,
    contractAddress: string,
    mode: 'MANUAL' | 'AUTO',
    sessionKeyId?: string
  ): Promise<void> {
    if (mode === 'AUTO' && sessionKeyId) {
      const estimatedCostWei = BigInt(1000000000000000);
      const validation = await this.sessionKeyManager.validateSessionKey(
        sessionKeyId,
        contractAddress,
        chain,
        estimatedCostWei,
        'mintPublic'
      );

      if (validation.valid && validation.sessionKeyRecord) {
        logger.info({ sessionKeyId, contractAddress, chain }, 'Auto-fire validated! Executing instant mint...');
        const results = await this.triggerMintJobs(chain, contractAddress);
        const firstResult = results[0];

        if (firstResult && firstResult.success && firstResult.txHash) {
          this.sessionKeyManager.logAutoFireAttempt(sessionKeyId, contractAddress, chain, true, firstResult.txHash);
          await Repository.updateSessionKeySpent(sessionKeyId, estimatedCostWei);

          const explorerUrl = formatTxExplorerLink(chain, firstResult.txHash);
          if (this.telegramNotifier) {
            await this.telegramNotifier(
              'CHAT_ID',
              `🚀 <b>AUTO-FIRED INSTANT MINT!</b>\n\n` +
              `📍 Contract: <code>${maskAddress(contractAddress)}</code>\n` +
              `🌐 Chain: <b>${chain.toUpperCase()}</b>\n` +
              `🔑 Session Key ID: <code>${sessionKeyId}</code>\n` +
              `Tx Hash: <code>${firstResult.txHash}</code>\n` +
              `View: <a href="${explorerUrl}">Block Explorer</a>`,
              { parse_mode: 'HTML' }
            );
          }
          return;
        } else {
          const decodedErrorMsg = firstResult?.error || 'Transaction execution reverted';
          this.sessionKeyManager.logAutoFireAttempt(sessionKeyId, contractAddress, chain, false, undefined, decodedErrorMsg);

          if (this.telegramNotifier) {
            await this.telegramNotifier(
              'CHAT_ID',
              `⚠️ <b>AUTO-FIRE MINT ATTEMPT REVERTED</b>\n\n` +
              `📍 Contract: <code>${maskAddress(contractAddress)}</code>\n` +
              `🌐 Chain: <b>${chain.toUpperCase()}</b>\n` +
              `Decoded Reason: <code>${decodedErrorMsg}</code>`,
              { parse_mode: 'HTML' }
            );
          }
          return;
        }
      } else {
        logger.warn({ sessionKeyId, reason: validation.reason }, 'Auto-fire blocked. Falling back to manual notification.');
      }
    }

    await this.triggerMintJobs(chain, contractAddress);
  }

  /**
   * Execute mint jobs instantly when condition is met or manually triggered
   */
  public async triggerMintJobs(chain: SupportedChain, contractAddress: string): Promise<TxResult[]> {
    const key = `${chain.toLowerCase()}:${contractAddress.toLowerCase()}`;
    const jobs = this.pendingJobs.get(key) || [];
    if (jobs.length === 0) {
      logger.info({ key }, 'No pending mint jobs queued for this contract');
      return [];
    }

    const adapter = this.getAdapter(chain);
    const results: TxResult[] = [];

    for (const job of jobs) {
      job.status = 'EXECUTING';
      await Repository.updateMintJob(job.id, 'EXECUTING');

      try {
        const params: MintParams = {
          contractAddress: job.contractAddress,
          chain: job.chain,
          quantity: job.quantity,
          walletAddress: job.walletAddress,
        };

        const builtTx = await this.txCache.getOrBuild(adapter, params);
        const result = await adapter.sendTx(builtTx);

        if (result.success) {
          job.status = 'SUCCESS';
          await Repository.updateMintJob(job.id, 'SUCCESS', result.txHash);
        } else {
          job.status = 'FAILED';
          await Repository.updateMintJob(job.id, 'FAILED', undefined, result.error);
        }
        results.push(result);
      } catch (error: any) {
        job.status = 'FAILED';
        await Repository.updateMintJob(job.id, 'FAILED', undefined, error.message);
        results.push({
          success: false,
          error: error.message,
          timestamp: Date.now(),
        });
      }
    }

    this.pendingJobs.delete(key);
    await Repository.updateWatchedContractStatus(contractAddress, chain, 'MINTED');

    return results;
  }
}
