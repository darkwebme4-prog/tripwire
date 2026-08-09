import { BuiltTx, ChainAdapter, MintParams } from '../chains/types.js';

export class TxBuilderCache {
  private static instance: TxBuilderCache;
  private prebuiltTxs: Map<string, BuiltTx> = new Map();

  private constructor() {}

  public static getInstance(): TxBuilderCache {
    if (!TxBuilderCache.instance) {
      TxBuilderCache.instance = new TxBuilderCache();
    }
    return TxBuilderCache.instance;
  }

  private getKey(chain: string, contractAddress: string, walletAddress: string): string {
    return `${chain.toLowerCase()}:${contractAddress.toLowerCase()}:${walletAddress.toLowerCase()}`;
  }

  /**
   * Pre-build transaction payload and cache it in memory
   */
  public async prebuildAndCache(adapter: ChainAdapter, params: MintParams): Promise<BuiltTx> {
    const key = this.getKey(params.chain, params.contractAddress, params.walletAddress);
    const built = await adapter.buildMintTx(params);
    this.prebuiltTxs.set(key, built);
    return built;
  }

  /**
   * Fetch cached pre-built transaction if ready, otherwise build on-the-fly
   */
  public async getOrBuild(adapter: ChainAdapter, params: MintParams): Promise<BuiltTx> {
    const key = this.getKey(params.chain, params.contractAddress, params.walletAddress);
    const cached = this.prebuiltTxs.get(key);
    if (cached && Date.now() - cached.createdAt < 60000) { // Valid for 60 seconds
      return cached;
    }
    return this.prebuildAndCache(adapter, params);
  }

  public invalidate(chain: string, contractAddress: string, walletAddress: string): void {
    const key = this.getKey(chain, contractAddress, walletAddress);
    this.prebuiltTxs.delete(key);
  }
}
