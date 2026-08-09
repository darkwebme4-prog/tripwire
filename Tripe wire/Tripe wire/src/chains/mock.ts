import { ChainAdapter, BuiltTx, GasEstimate, MintParams, SupportedChain, TxResult } from './types.js';

export class MockChainAdapter implements ChainAdapter {
  readonly chain: SupportedChain;
  readonly isEvm: boolean;
  private watchedContracts: Set<string> = new Set();
  private callbacks: Map<string, (event: any) => void> = new Map();

  constructor(chain: SupportedChain) {
    this.chain = chain;
    this.isEvm = chain !== 'solana';
  }

  async watchContract(contractAddress: string, callback: (event: any) => void): Promise<void> {
    const key = contractAddress.toLowerCase();
    this.watchedContracts.add(key);
    this.callbacks.set(key, callback);

    // Simulate immediate condition check or state flip notification in mock mode after 3s
    setTimeout(() => {
      if (this.watchedContracts.has(key)) {
        callback({
          type: 'MINT_AVAILABLE',
          contractAddress,
          chain: this.chain,
          timestamp: Date.now(),
          details: 'Mock state flip detected: mintEnabled = true',
        });
      }
    }, 3000);
  }

  async unwatchContract(contractAddress: string): Promise<void> {
    const key = contractAddress.toLowerCase();
    this.watchedContracts.delete(key);
    this.callbacks.delete(key);
  }

  async getGasEstimate(params: MintParams): Promise<GasEstimate> {
    return {
      estimatedGas: BigInt(150000),
      maxFeePerGas: BigInt(20000000000), // 20 gwei
      maxPriorityFeePerGas: BigInt(1500000000), // 1.5 gwei
      estimatedCostEthOrSol: '0.003',
    };
  }

  async buildMintTx(params: MintParams): Promise<BuiltTx> {
    return {
      id: `mock-tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      chain: params.chain,
      contractAddress: params.contractAddress,
      walletAddress: params.walletAddress,
      quantity: params.quantity,
      rawPayload: {
        to: params.contractAddress,
        value: '0',
        data: '0xa0712d680000000000000000000000000000000000000000000000000000000000000001', // mint(1)
        mock: true,
      },
      nonce: 42,
      isSigned: false,
      createdAt: Date.now(),
    };
  }

  async sendTx(builtTx: BuiltTx): Promise<TxResult> {
    // Check mainnet safety flag
    const liveAllowed = process.env.ENABLE_LIVE_MAINNET_SIGNING === 'true';
    if (!liveAllowed) {
      return {
        success: true,
        txHash: `0xmock_simulated_txhash_${Math.random().toString(36).substring(2, 12)}`,
        blockNumber: BigInt(12345678),
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      txHash: `0xmock_live_txhash_${Math.random().toString(36).substring(2, 12)}`,
      blockNumber: BigInt(12345688),
      timestamp: Date.now(),
    };
  }
}
