import { BuiltTx, SupportedChain } from '../chains/types.js';
import { CHAIN_CONFIGS } from '../chains/config.js';
import { createPublicClient, http, Hex } from 'viem';
import pino from 'pino';

const logger = pino({ name: 'WalletConnectRelay' });

export interface UnsignedTxPayload {
  to: string;
  data: string;
  valueHex: string;
  gasLimitHex: string;
  maxFeePerGasHex?: string;
  maxPriorityFeePerGasHex?: string;
  chainId?: number;
  walletConnectUri: string;
}

export class WalletConnectRelay {
  /**
   * Prepares an unsigned transaction payload for non-custodial WalletConnect approval.
   * Zero private keys are stored or used for custodial signing.
   */
  public static prepareUnsignedTx(builtTx: BuiltTx): UnsignedTxPayload {
    const config = CHAIN_CONFIGS[builtTx.chain];
    const raw = builtTx.rawPayload;

    const to = builtTx.contractAddress;
    const data = raw.data || '0x';
    const valueHex = raw.value ? `0x${BigInt(raw.value).toString(16)}` : '0x0';
    const gasLimitHex = raw.gas ? `0x${BigInt(raw.gas).toString(16)}` : '0x249f0';
    const maxFeePerGasHex = raw.maxFeePerGas ? `0x${BigInt(raw.maxFeePerGas).toString(16)}` : undefined;
    const maxPriorityFeePerGasHex = raw.maxPriorityFeePerGas ? `0x${BigInt(raw.maxPriorityFeePerGas).toString(16)}` : undefined;

    // Construct WalletConnect transaction URI for mobile wallet approval
    const wcParams = new URLSearchParams({
      to,
      data,
      value: valueHex,
      chainId: config.chainId?.toString() || '1',
    });
    const walletConnectUri = `wc:mint?${wcParams.toString()}`;

    logger.info({ chain: builtTx.chain, to, chainId: config.chainId }, 'Prepared non-custodial unsigned transaction payload');

    return {
      to,
      data,
      valueHex,
      gasLimitHex,
      maxFeePerGasHex,
      maxPriorityFeePerGasHex,
      chainId: config.chainId,
      walletConnectUri,
    };
  }

  /**
   * Polls transaction confirmation on-chain and invokes callback upon inclusion
   */
  public static async pollConfirmation(
    chain: SupportedChain,
    txHash: string,
    onStatusChange: (status: { success: boolean; blockNumber?: bigint; error?: string }) => void
  ): Promise<void> {
    const config = CHAIN_CONFIGS[chain];
    if (!config.isEvm) return; // EVM confirmation polling

    const provider = config.providers[0];
    if (!provider) return;

    const client = createPublicClient({
      transport: http(provider.rpcUrl),
    });

    let attempts = 0;
    const maxAttempts = 30; // Poll for 60 seconds (2s interval)

    const interval = setInterval(async () => {
      attempts++;
      try {
        const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
        if (receipt) {
          clearInterval(interval);
          const isSuccess = receipt.status === 'success';
          logger.info({ chain, txHash, isSuccess, blockNumber: receipt.blockNumber }, 'Transaction receipt confirmed on-chain');
          onStatusChange({
            success: isSuccess,
            blockNumber: receipt.blockNumber,
            error: isSuccess ? undefined : 'Transaction execution reverted',
          });
        }
      } catch (err) {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          logger.warn({ chain, txHash }, 'Transaction confirmation polling timed out');
          onStatusChange({ success: false, error: 'Confirmation polling timed out' });
        }
      }
    }, 2000);
  }
}
