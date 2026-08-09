import pino from 'pino';

const logger = pino({ name: 'PriceFeed' });

interface PriceCache {
  ethUsd: number;
  solUsd: number;
  updatedAt: number;
}

export class PriceFeedService {
  private static instance: PriceFeedService;
  private cache: PriceCache = {
    ethUsd: 3200, // Fallback default ETH USD price
    solUsd: 180,  // Fallback default SOL USD price
    updatedAt: 0,
  };
  private CACHE_TTL_MS = 60000; // 60s cache

  private constructor() {}

  public static getInstance(): PriceFeedService {
    if (!PriceFeedService.instance) {
      PriceFeedService.instance = new PriceFeedService();
    }
    return PriceFeedService.instance;
  }

  public async getPrices(): Promise<{ ethUsd: number; solUsd: number }> {
    const now = Date.now();
    if (now - this.cache.updatedAt < this.CACHE_TTL_MS) {
      return { ethUsd: this.cache.ethUsd, solUsd: this.cache.solUsd };
    }

    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd',
        { headers: { Accept: 'application/json' } }
      );
      if (response.ok) {
        const data: any = await response.json();
        if (data.ethereum?.usd) this.cache.ethUsd = Number(data.ethereum.usd);
        if (data.solana?.usd) this.cache.solUsd = Number(data.solana.usd);
        this.cache.updatedAt = now;
        logger.info({ ethUsd: this.cache.ethUsd, solUsd: this.cache.solUsd }, 'Updated native token USD prices');
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to fetch live CoinGecko USD price feed, using cached values');
    }

    return { ethUsd: this.cache.ethUsd, solUsd: this.cache.solUsd };
  }

  public async formatUsdValue(amountEthOrSol: number, symbol: 'ETH' | 'SOL'): Promise<string> {
    const prices = await this.getPrices();
    const rate = symbol === 'SOL' ? prices.solUsd : prices.ethUsd;
    const usdVal = amountEthOrSol * rate;
    return `$${usdVal.toFixed(2)} USD`;
  }
}
