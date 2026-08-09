export type SupportedChain = 'ethereum' | 'base' | 'arbitrum' | 'robinhood' | 'solana';

export interface MintParams {
  contractAddress: string;
  chain: SupportedChain;
  quantity: number;
  walletAddress: string;
  mintPriceEthOrSol?: string;
  customData?: string; // Hex payload or custom instruction
  useFlashbots?: boolean;
  feeMultiplier?: number; // EIP-1559 priority fee multiplier (ignored for Robinhood)
}

export interface GasEstimate {
  estimatedGas: bigint | number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedCostEthOrSol: string;
}

export interface BuiltTx {
  id: string;
  chain: SupportedChain;
  contractAddress: string;
  walletAddress: string;
  quantity: number;
  rawPayload: any; // Prepared transaction payload ready to sign/broadcast
  nonce?: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  isSigned: boolean;
  createdAt: number;
}

export interface TxResult {
  success: boolean;
  txHash?: string;
  blockNumber?: bigint | number;
  error?: string;
  timestamp: number;
}

export interface ChainAdapter {
  readonly chain: SupportedChain;
  readonly isEvm: boolean;

  /**
   * Start listening via WebSocket for state changes (e.g. mintEnabled flip, Unpause, public sale open)
   */
  watchContract(contractAddress: string, callback: (event: any) => void): Promise<void>;

  /**
   * Stop watching a contract
   */
  unwatchContract(contractAddress: string): Promise<void>;

  /**
   * Pre-build transaction payload so it's ready to sign/broadcast immediately
   */
  buildMintTx(params: MintParams): Promise<BuiltTx>;

  /**
   * Send/broadcast the built transaction
   */
  sendTx(builtTx: BuiltTx): Promise<TxResult>;

  /**
   * Get dynamic gas/fee estimate
   */
  getGasEstimate(params: MintParams): Promise<GasEstimate>;

  /**
   * Dry-run simulation check before broadcast
   */
  simulateMintTx?(params: MintParams): Promise<{ success: boolean; result?: any; revertReason?: string; rawError?: any }>;

  /**
   * Subscribe to contract event logs via WebSocket
   */
  subscribeMintEvents?(contractAddress: string, callback: (log: any) => void): () => void;
}
