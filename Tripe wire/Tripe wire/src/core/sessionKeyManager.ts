import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Hex, formatEther } from 'viem';
import { Repository, SessionKeyRecord } from '../db/repository.js';
import pino from 'pino';

const logger = pino({ name: 'SessionKeyManager' });

export interface SessionKeyValidationResult {
  valid: boolean;
  reason?: string;
  sessionKeyRecord?: SessionKeyRecord;
}

export class SessionKeyManager {
  private static instance: SessionKeyManager;
  private autoPausedGlobal = false;

  private constructor() {}

  public static getInstance(): SessionKeyManager {
    if (!SessionKeyManager.instance) {
      SessionKeyManager.instance = new SessionKeyManager();
    }
    return SessionKeyManager.instance;
  }

  /**
   * Generates a temporary ERC-4337 scoped session keypair.
   * Scoped to: Target contract ONLY, mintPublic function ONLY, Max spend cap, Expiry.
   */
  public async generateSessionKey(
    userWalletAddress: string,
    contractAddress: string,
    chain: string,
    maxSpendWei: bigint,
    durationHours: number = 24,
    allowedFunction: string = 'mintPublic'
  ): Promise<SessionKeyRecord> {
    const sessionPrivateKey = generatePrivateKey();
    const account = privateKeyToAccount(sessionPrivateKey);
    const sessionKeyId = `sk-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = Math.floor(Date.now() / 1000) + durationHours * 3600;

    const record = await Repository.createSessionKey(
      sessionKeyId,
      account.address,
      sessionPrivateKey,
      userWalletAddress,
      contractAddress,
      chain,
      maxSpendWei.toString(),
      expiresAt,
      allowedFunction
    );

    logger.info(
      {
        sessionKeyId,
        sessionPublicAddress: account.address,
        contractAddress,
        chain,
        maxSpendEth: formatEther(maxSpendWei),
        expiresAt,
      },
      'Generated new ERC-4337 scoped session key'
    );

    return record;
  }

  /**
   * Validates session key scope, spend cap, function, and expiry before any auto-fire attempt
   */
  public async validateSessionKey(
    sessionKeyId: string,
    targetContract: string,
    chain: string,
    requestedTxCostWei: bigint,
    functionName: string = 'mintPublic'
  ): Promise<SessionKeyValidationResult> {
    if (this.autoPausedGlobal) {
      logger.warn({ sessionKeyId }, 'Auto-fire blocked: Global /pauseauto is active');
      return { valid: false, reason: 'Global auto-fire is paused (/pauseauto)' };
    }

    const keyRecord = await Repository.getSessionKey(sessionKeyId);
    if (!keyRecord) {
      return { valid: false, reason: 'Session key not found' };
    }

    if (keyRecord.is_revoked === 1) {
      return { valid: false, reason: 'Session key has been revoked' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > keyRecord.expires_at) {
      return { valid: false, reason: 'Session key has expired (24h limit reached)' };
    }

    if (keyRecord.contract_address.toLowerCase() !== targetContract.toLowerCase()) {
      return { valid: false, reason: `Contract scope mismatch. Session key restricted to ${keyRecord.contract_address}` };
    }

    if (keyRecord.chain.toLowerCase() !== chain.toLowerCase()) {
      return { valid: false, reason: `Chain scope mismatch. Session key restricted to ${keyRecord.chain}` };
    }

    if (keyRecord.allowed_function !== functionName) {
      return { valid: false, reason: `Function scope mismatch. Session key restricted to ${keyRecord.allowed_function}` };
    }

    // Hard spend cap check: Ensure current spent + requested cost <= max spend
    const maxSpend = BigInt(keyRecord.max_spend_wei || '0');
    const currentSpent = BigInt(keyRecord.current_spent_wei || '0');
    const totalAfterTx = currentSpent + requestedTxCostWei;

    if (maxSpend > BigInt(0) && totalAfterTx > maxSpend) {
      const remainingWei = maxSpend > currentSpent ? maxSpend - currentSpent : BigInt(0);
      return {
        valid: false,
        reason: `Max spend cap exceeded. Remaining allowance: ${formatEther(remainingWei)} ETH, Requested: ${formatEther(requestedTxCostWei)} ETH`,
      };
    }

    return { valid: true, sessionKeyRecord: keyRecord };
  }

  /**
   * Log auto-fire attempt (success or failure) with contract, chain, and session key ID
   */
  public logAutoFireAttempt(
    sessionKeyId: string,
    contractAddress: string,
    chain: string,
    success: boolean,
    txHash?: string,
    error?: string
  ): void {
    logger.info(
      {
        sessionKeyId,
        contractAddress,
        chain,
        success,
        txHash,
        error,
      },
      `Auto-fire attempt executed [${success ? 'SUCCESS' : 'FAILED'}]`
    );
  }

  // Global pause controls
  public pauseAutoFire(): void {
    this.autoPausedGlobal = true;
    Repository.revokeAllSessionKeys().catch(() => {});
    logger.warn('GLOBAL PAUSE: All auto-fire jobs paused and session keys revoked (/pauseauto)');
  }

  public resumeAutoFire(): void {
    this.autoPausedGlobal = false;
    logger.info('Global auto-fire resumed');
  }

  public isAutoPaused(): boolean {
    return this.autoPausedGlobal;
  }
}
