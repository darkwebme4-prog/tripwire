import { db } from './index.js';

export interface WatchedContractRecord {
  id: number;
  contract_address: string;
  chain: string;
  status: string;
  target_function: string;
  mode: 'MANUAL' | 'AUTO';
  session_key_id?: string;
  created_at: string;
}

export interface SessionKeyRecord {
  id: number;
  session_key_id: string;
  public_address: string;
  private_key: string;
  user_wallet_address: string;
  contract_address: string;
  chain: string;
  allowed_function: string;
  max_spend_wei: string;
  current_spent_wei: string;
  expires_at: number;
  is_revoked: number;
  created_at: string;
}

export interface WalletConfigRecord {
  id: number;
  label: string;
  chain_type: string;
  public_address: string;
  env_var_name: string;
  is_active: number;
}

export interface MintHistoryRecord {
  id: number;
  contract_address: string;
  chain: string;
  wallet_address: string;
  quantity: number;
  status: string;
  tx_hash?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export class Repository {
  // Watched Contracts
  static async addWatchedContract(
    address: string,
    chain: string,
    mode: 'MANUAL' | 'AUTO' = 'MANUAL',
    sessionKeyId?: string,
    targetFunction: string = 'mint'
  ): Promise<WatchedContractRecord> {
    const res = await db.execute({
      sql: `
        INSERT INTO watched_contracts (contract_address, chain, target_function, mode, session_key_id, status)
        VALUES (?, ?, ?, ?, ?, 'MONITORING')
        ON CONFLICT(contract_address, chain) DO UPDATE SET status = 'MONITORING', mode = excluded.mode, session_key_id = excluded.session_key_id
        RETURNING *
      `,
      args: [address.toLowerCase(), chain.toLowerCase(), targetFunction, mode, sessionKeyId || null],
    });
    return res.rows[0] as unknown as WatchedContractRecord;
  }

  static async removeWatchedContract(address: string): Promise<boolean> {
    const res = await db.execute({
      sql: `DELETE FROM watched_contracts WHERE LOWER(contract_address) = LOWER(?)`,
      args: [address],
    });
    return res.rowsAffected > 0;
  }

  static async getWatchedContracts(): Promise<WatchedContractRecord[]> {
    const res = await db.execute(`SELECT * FROM watched_contracts ORDER BY created_at DESC`);
    return res.rows as unknown as WatchedContractRecord[];
  }

  static async updateWatchedContractStatus(address: string, chain: string, status: string): Promise<void> {
    await db.execute({
      sql: `UPDATE watched_contracts SET status = ? WHERE LOWER(contract_address) = LOWER(?) AND LOWER(chain) = LOWER(?)`,
      args: [status, address.toLowerCase(), chain.toLowerCase()],
    });
  }

  // Session Keys
  static async createSessionKey(
    sessionKeyId: string,
    publicAddress: string,
    privateKey: string,
    userWalletAddress: string,
    contractAddress: string,
    chain: string,
    maxSpendWei: string,
    expiresAt: number,
    allowedFunction: string = 'mintPublic'
  ): Promise<SessionKeyRecord> {
    const res = await db.execute({
      sql: `
        INSERT INTO session_keys (session_key_id, public_address, private_key, user_wallet_address, contract_address, chain, allowed_function, max_spend_wei, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `,
      args: [
        sessionKeyId,
        publicAddress.toLowerCase(),
        privateKey,
        userWalletAddress.toLowerCase(),
        contractAddress.toLowerCase(),
        chain.toLowerCase(),
        allowedFunction,
        maxSpendWei,
        expiresAt,
      ],
    });
    return res.rows[0] as unknown as SessionKeyRecord;
  }

  static async getSessionKey(sessionKeyId: string): Promise<SessionKeyRecord | undefined> {
    const res = await db.execute({
      sql: `SELECT * FROM session_keys WHERE session_key_id = ?`,
      args: [sessionKeyId],
    });
    return (res.rows[0] as unknown as SessionKeyRecord) || undefined;
  }

  static async updateSessionKeySpent(sessionKeyId: string, additionalSpentWei: bigint): Promise<void> {
    const record = await this.getSessionKey(sessionKeyId);
    if (!record) return;

    const current = BigInt(record.current_spent_wei || '0');
    const updated = (current + additionalSpentWei).toString();

    await db.execute({
      sql: `UPDATE session_keys SET current_spent_wei = ? WHERE session_key_id = ?`,
      args: [updated, sessionKeyId],
    });
  }

  static async revokeSessionKey(sessionKeyId: string): Promise<void> {
    await db.execute({
      sql: `UPDATE session_keys SET is_revoked = 1 WHERE session_key_id = ?`,
      args: [sessionKeyId],
    });
  }

  static async revokeAllSessionKeys(): Promise<number> {
    const res = await db.execute(`UPDATE session_keys SET is_revoked = 1`);
    return res.rowsAffected;
  }

  // Wallet Configs
  static async upsertWallet(label: string, chainType: string, publicAddress: string, envVarName: string): Promise<WalletConfigRecord> {
    const res = await db.execute({
      sql: `
        INSERT INTO wallet_configs (label, chain_type, public_address, env_var_name)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(public_address) DO UPDATE SET label = excluded.label, env_var_name = excluded.env_var_name
        RETURNING *
      `,
      args: [label, chainType.toUpperCase(), publicAddress, envVarName],
    });
    return res.rows[0] as unknown as WalletConfigRecord;
  }

  static async removeWallet(address: string): Promise<boolean> {
    const res = await db.execute({
      sql: `DELETE FROM wallet_configs WHERE LOWER(public_address) = LOWER(?)`,
      args: [address],
    });
    return res.rowsAffected > 0;
  }

  static async removeAllWallets(): Promise<number> {
    const res = await db.execute(`DELETE FROM wallet_configs`);
    return res.rowsAffected;
  }

  static async getActiveWallets(): Promise<WalletConfigRecord[]> {
    const res = await db.execute(`SELECT * FROM wallet_configs WHERE is_active = 1`);
    return res.rows as unknown as WalletConfigRecord[];
  }

  // Mint History
  static async recordMintJob(contractAddress: string, chain: string, walletAddress: string, quantity: number): Promise<number> {
    const res = await db.execute({
      sql: `
        INSERT INTO mint_history (contract_address, chain, wallet_address, quantity, status)
        VALUES (?, ?, ?, ?, 'QUEUED')
      `,
      args: [contractAddress.toLowerCase(), chain.toLowerCase(), walletAddress, quantity],
    });
    return Number(res.lastInsertRowid);
  }

  static async updateMintJob(id: number, status: string, txHash?: string, errorMessage?: string): Promise<void> {
    await db.execute({
      sql: `
        UPDATE mint_history
        SET status = ?, tx_hash = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [status, txHash || null, errorMessage || null, id],
    });
  }

  static async getMintHistory(limit: number = 10): Promise<MintHistoryRecord[]> {
    const res = await db.execute({
      sql: `SELECT * FROM mint_history ORDER BY updated_at DESC LIMIT ?`,
      args: [limit],
    });
    return res.rows as unknown as MintHistoryRecord[];
  }
}
