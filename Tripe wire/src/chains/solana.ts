import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { BuiltTx, ChainAdapter, GasEstimate, MintParams, SupportedChain, TxResult } from './types.js';
import { CHAIN_CONFIGS } from './config.js';
import { ResilientRpcManager } from './rpcClient.js';
import { WalletManager } from '../core/walletManager.js';
import pino from 'pino';

const logger = pino({ name: 'SolanaChainAdapter' });

export class SolanaChainAdapter implements ChainAdapter {
  readonly chain: SupportedChain = 'solana';
  readonly isEvm = false;
  private walletManager = WalletManager.getInstance();
  private subscriptionId?: number;

  constructor() {
    const primaryProvider = CHAIN_CONFIGS.solana.providers[0];
    if (!primaryProvider || !primaryProvider.rpcUrl) {
      throw new Error("RPC Provider configuration missing for chain 'solana'. Please check your .env file.");
    }
  }

  private parsePrivateKey(keyStr: string): Uint8Array | null {
    try {
      if (keyStr.startsWith('[') && keyStr.endsWith(']')) {
        return new Uint8Array(JSON.parse(keyStr));
      }
      const buffer = Buffer.from(keyStr, 'hex');
      if (buffer.length === 64) {
        return new Uint8Array(buffer);
      }
      return null;
    } catch {
      return null;
    }
  }

  async watchContract(contractAddress: string, callback: (event: any) => void): Promise<void> {
    const wsProvider = CHAIN_CONFIGS.solana.providers.find((p) => p.supportsWs && p.wsUrl);
    logger.info({ chain: this.chain, contractAddress, provider: wsProvider?.name || 'PRIMARY' }, 'Subscribing to Solana account changes via WebSocket');

    try {
      const pubkey = new PublicKey(contractAddress);
      await ResilientRpcManager.executeSolanaFallback(async (connection, providerName) => {
        this.subscriptionId = connection.onAccountChange(
          pubkey,
          (accountInfo, context) => {
            logger.info({ chain: this.chain, contractAddress, slot: context.slot, provider: providerName }, 'Solana account change detected!');
            callback({
              type: 'SOLANA_ACCOUNT_CHANGED',
              chain: this.chain,
              contractAddress,
              slot: context.slot,
              dataLength: accountInfo.data.length,
              timestamp: Date.now(),
            });
          },
          'confirmed'
        );
      });
    } catch (err: any) {
      logger.error({ chain: this.chain, error: err.message }, 'Failed to subscribe to Solana WebSocket across providers');
    }
  }

  async unwatchContract(contractAddress: string): Promise<void> {
    if (this.subscriptionId !== undefined) {
      const primaryProvider = CHAIN_CONFIGS.solana.providers[0];
      if (primaryProvider) {
        const connection = new Connection(primaryProvider.rpcUrl, 'confirmed');
        await connection.removeAccountChangeListener(this.subscriptionId).catch(() => {});
      }
      this.subscriptionId = undefined;
    }
  }

  async getGasEstimate(params: MintParams): Promise<GasEstimate> {
    const lamports = 5000;
    return {
      estimatedGas: lamports,
      estimatedCostEthOrSol: (lamports / LAMPORTS_PER_SOL).toString(),
    };
  }

  async buildMintTx(params: MintParams): Promise<BuiltTx> {
    const primaryProvider = CHAIN_CONFIGS.solana.providers[0];
    if (!primaryProvider || !primaryProvider.rpcUrl) {
      throw new Error("Solana RPC URL missing. Please check .env configuration.");
    }

    const rawKey = this.walletManager.getPrivateKey(params.walletAddress);
    if (!rawKey) {
      throw new Error(`Solana private key not found for address '${params.walletAddress}'. Add wallet via /addwallet first.`);
    }

    const keyArray = this.parsePrivateKey(rawKey);
    if (!keyArray) {
      throw new Error('Invalid Solana private key stored');
    }

    const keypair = Keypair.fromSecretKey(keyArray);
    const recipient = new PublicKey(params.contractAddress);

    const { blockhash } = await ResilientRpcManager.executeSolanaFallback(async (connection) => {
      return await connection.getLatestBlockhash('confirmed');
    });

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: keypair.publicKey,
    }).add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipient,
        lamports: params.mintPriceEthOrSol ? parseFloat(params.mintPriceEthOrSol) * LAMPORTS_PER_SOL : 0,
      })
    );

    return {
      id: `solana-tx-${Date.now()}`,
      chain: 'solana',
      contractAddress: params.contractAddress,
      walletAddress: keypair.publicKey.toBase58(),
      quantity: params.quantity,
      rawPayload: transaction,
      isSigned: false,
      createdAt: Date.now(),
    };
  }

  async sendTx(builtTx: BuiltTx): Promise<TxResult> {
    const primaryProvider = CHAIN_CONFIGS.solana.providers[0];
    if (!primaryProvider || !primaryProvider.rpcUrl) {
      throw new Error("Solana RPC Provider missing. Cannot broadcast transaction.");
    }

    const rawKey = this.walletManager.getPrivateKey(builtTx.walletAddress);
    if (!rawKey) {
      throw new Error(`Solana keypair missing for ${builtTx.walletAddress}`);
    }

    const keyArray = this.parsePrivateKey(rawKey);
    if (!keyArray) throw new Error('Invalid Solana key');

    const keypair = Keypair.fromSecretKey(keyArray);

    try {
      const signature = await ResilientRpcManager.executeSolanaFallback(async (connection) => {
        const transaction: Transaction = builtTx.rawPayload;
        return await sendAndConfirmTransaction(connection, transaction, [keypair]);
      });

      logger.info({ chain: this.chain, signature, rpc: primaryProvider.rpcUrl }, 'Real on-chain Solana transaction confirmed!');

      return {
        success: true,
        txHash: signature,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      logger.error({ chain: this.chain, error: err.message }, 'Failed to broadcast Solana transaction');
      return {
        success: false,
        error: err.message,
        timestamp: Date.now(),
      };
    }
  }
}
