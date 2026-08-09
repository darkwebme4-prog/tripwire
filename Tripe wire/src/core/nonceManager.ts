export class NonceManager {
  private static instance: NonceManager;
  private walletNonces: Map<string, number> = new Map();
  private pendingLocks: Map<string, Promise<void>> = new Map();

  private constructor() {}

  public static getInstance(): NonceManager {
    if (!NonceManager.instance) {
      NonceManager.instance = new NonceManager();
    }
    return NonceManager.instance;
  }

  private getKey(chain: string, address: string): string {
    return `${chain.toLowerCase()}:${address.toLowerCase()}`;
  }

  public getNextNonce(chain: string, address: string, onChainNonceFetcher: () => Promise<number>): Promise<number> {
    const key = this.getKey(chain, address);

    // Synchronize concurrent getNextNonce calls per wallet/chain
    const existingLock = this.pendingLocks.get(key) || Promise.resolve();

    const newLock = existingLock.then(async () => {
      let current = this.walletNonces.get(key);
      if (current === undefined) {
        current = await onChainNonceFetcher();
      }
      const nonceToUse = current;
      this.walletNonces.set(key, current + 1);
      return nonceToUse;
    });

    // Update lock map (and catch error to preserve chain)
    this.pendingLocks.set(
      key,
      newLock.then(
        () => {},
        () => {}
      )
    );

    return newLock as Promise<number>;
  }

  public setNonce(chain: string, address: string, nonce: number): void {
    const key = this.getKey(chain, address);
    this.walletNonces.set(key, nonce);
  }

  public reset(chain: string, address: string): void {
    const key = this.getKey(chain, address);
    this.walletNonces.delete(key);
  }
}
