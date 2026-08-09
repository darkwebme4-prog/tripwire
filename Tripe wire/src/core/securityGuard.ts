import { BuiltTx, SupportedChain } from '../chains/types.js';
import pino from 'pino';

const logger = pino({ name: 'SecurityGuard' });

// List of publicly known dev/test addresses (Hardhat, Anvil, Foundry defaults)
// NEVER allowed to sign or execute transactions on MAINNET
export const BLOCKED_DEV_TEST_ADDRESSES: Set<string> = new Set([
  // Hardhat & Anvil Default Accounts
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // Hardhat #0
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', // Hardhat #1
  '0x3c44cdd05ab5b990176499dd5238185708853064', // Hardhat #2
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906', // Hardhat #3
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65', // Hardhat #4
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc', // Hardhat #5
  '0x976ea74026e726554db657fa54763abd0c3a0aa9', // Hardhat #6
  '0x14dc79964da2c08b23698b3d3cc7ca32193d9955', // Hardhat #7
  '0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f', // Hardhat #8
  '0xa0ee7a142d267c1f36714e4a8f75612f20a79720', // Hardhat #9
  '0xbcd4042de499d14e55001ccbb24a551f3b954096', // Hardhat #10
  '0x71cb350837400e0633446699f8c615242d385ebb', // Hardhat #11
  '0xc783df8a4429ae37d119335da438183141fef27d', // Hardhat #12
  '0xeeb5e1e755255476f555c91f09e86c0757a2c0bc', // Hardhat #13
  '0x933b934b172a6e95c10644e55f00e285a8523c9a', // Hardhat #14
  '0xb86c476537dbacb7654ec471894d076d5e7589ed', // Hardhat #15
  '0x41f3e7edec2dc942ebdfc437ddc526d1d4d8c8ef', // Hardhat #16
  '0x3d0cfcfc3e5a5a1532f83d9585641f6f1c4e782e', // Hardhat #17
  '0x24a40ecb5c464b5952db5cf79aefab58cfc27ea3', // Hardhat #18
  '0x6d90bfb8d5e5bfa780d603a11f26a1ec14eeb2e2', // Hardhat #19
]);

export class SecurityGuard {
  /**
   * Asserts that a signing wallet address is NOT a well-known public dev/test address when interacting on MAINNET
   */
  public static assertSafeSigningAccount(address: string, chain: SupportedChain): void {
    if (!address) return;

    const normalized = address.toLowerCase();

    if (BLOCKED_DEV_TEST_ADDRESSES.has(normalized)) {
      logger.error(
        { address, chain },
        'SECURITY ALERT BLOCKED: Attempted to send transaction on MAINNET using publicly known dev/test account'
      );
      throw new Error(
        `SECURITY ALERT: Refusing to send transaction on ${chain.toUpperCase()} MAINNET using publicly known dev/test account (${address}). Please add your own wallet via /addwallet.`
      );
    }
  }

  /**
   * Asserts that a built transaction is well-formed with required EIP-1559 fee fields
   */
  public static assertWellFormedTx(builtTx: BuiltTx): void {
    if (builtTx.chain === 'solana') return;

    const payload = builtTx.rawPayload;
    if (!payload) {
      throw new Error(`MALFORMED TRANSACTION: Missing raw payload for chain '${builtTx.chain}'`);
    }

    if (payload.type !== 'eip1559') {
      throw new Error(
        `MALFORMED TRANSACTION: Invalid transaction type '${payload.type || 'undefined'}' for chain '${builtTx.chain}'. Expected 'eip1559'.`
      );
    }

    if (payload.maxFeePerGas === undefined || payload.maxFeePerGas === null || payload.maxPriorityFeePerGas === undefined || payload.maxPriorityFeePerGas === null) {
      throw new Error(
        `MALFORMED TRANSACTION: Built EVM transaction for '${builtTx.chain}' is missing required EIP-1559 fee fields (maxFeePerGas: ${payload.maxFeePerGas}, maxPriorityFeePerGas: ${payload.maxPriorityFeePerGas}).`
      );
    }
  }

  /**
   * Returns formatted Mainnet warning text for Telegram UI confirmation cards
   */
  public static getMainnetWarningBanner(chain: SupportedChain): string {
    const chainNameMap: Record<SupportedChain, string> = {
      ethereum: 'ETHEREUM MAINNET',
      base: 'BASE MAINNET',
      arbitrum: 'ARBITRUM MAINNET',
      robinhood: 'ROBINHOOD MAINNET',
      solana: 'SOLANA DEVNET',
    };

    const networkName = chainNameMap[chain] || `${chain.toUpperCase()} MAINNET`;
    return `⚠️ <b>MAINNET TRANSACTION WARNING: You are about to send a REAL transaction with REAL funds on ${networkName}.</b>`;
  }
}
