import { privateKeyToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import { Hex } from 'viem';
import bs58 from 'bs58';
import { Repository } from '../db/repository.js';
import { BLOCKED_DEV_TEST_ADDRESSES } from './securityGuard.js';
import pino from 'pino';

const logger = pino({ name: 'WalletManager' });

export class WalletManager {
  private static instance: WalletManager;
  // Secure in-memory store mapping lowercased public address -> raw private key
  private keyStore: Map<string, string> = new Map();
  private activeWalletPerChain: Map<string, string> = new Map(); // chainType -> publicAddress

  private constructor() {
    this.loadEnvWallets();
  }

  public static getInstance(): WalletManager {
    if (!WalletManager.instance) {
      WalletManager.instance = new WalletManager();
    }
    return WalletManager.instance;
  }

  /**
   * Pre-load any default wallets configured in .env on startup
   */
  private loadEnvWallets(): void {
    let evmKey = process.env.EVM_PRIVATE_KEY_PRIMARY;
    if (evmKey) {
      evmKey = evmKey.trim();
      if (/^[a-fA-F0-9]{64}$/.test(evmKey)) {
        evmKey = `0x${evmKey}`;
      }
      if (/^0x[a-fA-F0-9]{64}$/.test(evmKey)) {
        try {
          const account = privateKeyToAccount(evmKey as Hex);
          const address = account.address.toLowerCase();

          // Refuse public dev/test keys from env
          if (!BLOCKED_DEV_TEST_ADDRESSES.has(address)) {
            this.keyStore.set(address, evmKey);
            this.activeWalletPerChain.set('EVM', address);
            Repository.upsertWallet('Primary EVM Wallet', 'EVM', account.address, 'EVM_PRIVATE_KEY_PRIMARY').catch(() => {});
          } else {
            logger.warn({ address }, 'Blocked dev test address detected in .env; skipping default wallet load.');
          }
        } catch (err: any) {
          logger.warn('Could not load default EVM key from env');
        }
      }
    }

    const solKey = process.env.SOLANA_PRIVATE_KEY_PRIMARY;
    if (solKey && solKey !== '5K1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef') {
      try {
        const keyArray = this.parseSolanaKey(solKey);
        if (keyArray) {
          const kp = Keypair.fromSecretKey(keyArray);
          const address = kp.publicKey.toBase58().toLowerCase();
          this.keyStore.set(address, solKey);
          this.activeWalletPerChain.set('SOLANA', address);
          Repository.upsertWallet('Primary Solana Wallet', 'SOLANA', kp.publicKey.toBase58(), 'SOLANA_PRIVATE_KEY_PRIMARY').catch(() => {});
        }
      } catch (err: any) {
        logger.warn('Could not load default Solana key from env');
      }
    }
  }

  private parseSolanaKey(keyStr: string): Uint8Array | null {
    try {
      const trimmed = keyStr.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return new Uint8Array(JSON.parse(trimmed));
      }
      // Base58 decoding (Phantom / Solflare format)
      const decoded = bs58.decode(trimmed);
      if (decoded.length === 64) {
        return decoded;
      }
      const buffer = Buffer.from(trimmed, 'hex');
      if (buffer.length === 64) {
        return new Uint8Array(buffer);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Allows a Telegram user to dynamically add their own wallet by private key.
   * Supports EVM hex keys (with or without 0x prefix) and Solana Base58 secret keys.
   */
  public async addWallet(privateKeyInput: string, customLabel?: string): Promise<{ publicAddress: string; chainType: 'EVM' | 'SOLANA'; label: string }> {
    let trimmedKey = privateKeyInput.trim();

    // Auto-fix EVM keys missing '0x' prefix (64 hex characters)
    if (/^[a-fA-F0-9]{64}$/.test(trimmedKey)) {
      trimmedKey = `0x${trimmedKey}`;
    }

    // Check if EVM Hex Private Key (66 characters starting with 0x)
    if (/^0x[a-fA-F0-9]{64}$/.test(trimmedKey)) {
      const hexKey = trimmedKey as Hex;
      const account = privateKeyToAccount(hexKey);
      const publicAddress = account.address;

      if (BLOCKED_DEV_TEST_ADDRESSES.has(publicAddress.toLowerCase())) {
        throw new Error(
          `SECURITY ALERT: Cannot add publicly known dev/test account (${publicAddress}). Please use your own private key.`
        );
      }

      const label = customLabel || `EVM Wallet (${publicAddress.substring(0, 6)})`;

      this.keyStore.set(publicAddress.toLowerCase(), hexKey);
      this.activeWalletPerChain.set('EVM', publicAddress.toLowerCase());

      await Repository.upsertWallet(label, 'EVM', publicAddress, 'USER_PROVIDED');
      logger.info({ publicAddress, chainType: 'EVM' }, 'User successfully added custom EVM wallet');

      return { publicAddress, chainType: 'EVM', label };
    }

    // Check if Solana Private Key (Base58 string, array, or hex)
    const solArray = this.parseSolanaKey(trimmedKey);
    if (solArray) {
      const keypair = Keypair.fromSecretKey(solArray);
      const publicAddress = keypair.publicKey.toBase58();
      const label = customLabel || `Solana Wallet (${publicAddress.substring(0, 6)})`;

      this.keyStore.set(publicAddress.toLowerCase(), trimmedKey);
      this.activeWalletPerChain.set('SOLANA', publicAddress.toLowerCase());

      await Repository.upsertWallet(label, 'SOLANA', publicAddress, 'USER_PROVIDED');
      logger.info({ publicAddress, chainType: 'SOLANA' }, 'User successfully added custom Solana wallet');

      return { publicAddress, chainType: 'SOLANA', label };
    }

    throw new Error(
      'Invalid private key format. Expected a 64-character EVM hex key (with or without 0x prefix) or a valid Solana secret key.'
    );
  }

  /**
   * Completely removes all wallets from in-memory store and SQLite DB
   */
  public async removeAllWallets(): Promise<number> {
    this.keyStore.clear();
    this.activeWalletPerChain.clear();
    const count = await Repository.removeAllWallets();
    logger.info({ count }, 'Wiped all wallets from WalletManager & DB');
    return count;
  }

  /**
   * Removes a specific wallet address from memory and DB
   */
  public async removeWallet(publicAddress: string): Promise<boolean> {
    const normalized = publicAddress.toLowerCase();
    this.keyStore.delete(normalized);
    for (const [chain, addr] of this.activeWalletPerChain.entries()) {
      if (addr === normalized) {
        this.activeWalletPerChain.delete(chain);
      }
    }
    const removed = await Repository.removeWallet(publicAddress);
    logger.info({ publicAddress, removed }, 'Removed wallet from WalletManager & DB');
    return removed;
  }

  /**
   * Retrieves the raw private key for a given public address
   */
  public getPrivateKey(publicAddress: string): string | undefined {
    return this.keyStore.get(publicAddress.toLowerCase());
  }

  /**
   * Gets the active public address for EVM or SOLANA
   */
  public getActiveAddress(chainType: 'EVM' | 'SOLANA'): string | undefined {
    return this.activeWalletPerChain.get(chainType.toUpperCase());
  }

  /**
   * Sets the active wallet address for a chain
   */
  public setActiveAddress(chainType: 'EVM' | 'SOLANA', publicAddress: string): void {
    this.activeWalletPerChain.set(chainType.toUpperCase(), publicAddress.toLowerCase());
  }
}
