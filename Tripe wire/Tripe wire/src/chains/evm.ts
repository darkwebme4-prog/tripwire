import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  parseAbi,
  encodeFunctionData,
  PublicClient,
  Hex,
  formatEther,
  parseEther,
  defineChain,
  Chain,
  decodeErrorResult,
  toFunctionSelector
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, base, arbitrum, baseSepolia } from 'viem/chains';
import { BuiltTx, ChainAdapter, GasEstimate, MintParams, SupportedChain, TxResult } from './types.js';
import { CHAIN_CONFIGS, ChainConfig } from './config.js';
import { ResilientRpcManager } from './rpcClient.js';
import { NonceManager } from '../core/nonceManager.js';
import { WalletManager } from '../core/walletManager.js';
import { SecurityGuard } from '../core/securityGuard.js';
import { SEADROP_V1_ABI, ERC721_MINIMAL_ABI, CANONICAL_SEADROP_CONTRACT, SeaDropInspector } from './seadrop.js';
import pino from 'pino';

const logger = pino({ name: 'EvmChainAdapter' });

export const SEADROP_ERRORS_ABI = parseAbi([
  'error SoldOut()',
  'error NotActive()',
  'error IncorrectPayment(uint256 got, uint256 expected)',
  'error MintQuantityExceedsMaxTotalMintableByWallet(uint256 total, uint256 maxAllowed)',
  'error MintQuantityExceedsMaxMintablePerWallet()',
  'error FeeRecipientCannotBeZeroAddress()',
  'error InvalidFeeRecipient()',
  'error FeeRecipientNotAllowed()',
  'error FeeRecipientNotAllowed(address feeRecipient)',
  'error CannotGivePayerFeeRecipientIfRestricted()',
  'error InvalidFeeBps()',
  'error TokenGatedNotActive()',
  'error AllowListNotActive()',
  'error InvalidProof()',
  'error SignatureExpired()',
  'error ExceedsMaxSupply()',
  'error TargetInvalid()',
  'error ContractIsInactive()',
]);

// Canonical SeaDrop error selector map derived via exact keccak256 hash matching
const KNOWN_SEADROP_ERROR_SELECTORS: Record<string, string> = {
  '0x72760da7': 'SeaDrop Error: SoldOut (Collection Sold Out)',
  '0x944ebe49': 'SeaDrop Error: NotActive (Public Drop Not Active)',
  '0x0235a935': 'SeaDrop Error: IncorrectPayment',
  '0xd11b2089': 'SeaDrop Error: MintQuantityExceedsMaxTotalMintableByWallet',
  '0xa1d8417a': 'SeaDrop Error: MintQuantityExceedsMaxMintablePerWallet',
  '0x5136e8d5': 'SeaDrop Error: FeeRecipientCannotBeZeroAddress',
  '0x2fa06f24': 'SeaDrop Error: InvalidFeeRecipient',
  '0x313f804b': 'SeaDrop Error: FeeRecipientNotAllowed',
  '0xfc3e7fd1': 'SeaDrop Error: FeeRecipientNotAllowed',
  '0x9732d7b9': 'SeaDrop Error: CannotGivePayerFeeRecipientIfRestricted',
  '0x92b1d417': 'SeaDrop Error: InvalidFeeBps',
  '0xddab028d': 'SeaDrop Error: TokenGatedNotActive',
  '0x70c61d4f': 'SeaDrop Error: AllowListNotActive',
  '0x6be27652': 'SeaDrop Error: InvalidProof',
  '0xa9e15a4f': 'SeaDrop Error: SignatureExpired',
  '0xb7f4c93b': 'SeaDrop Error: ExceedsMaxSupply',
  '0x13da22f2': 'SeaDrop Error: NotActive',
};

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [CHAIN_CONFIGS.robinhood.providers[0]?.rpcUrl || 'https://robinhood-mainnet.g.alchemy.com/v2/demo'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.robinhood.com' },
  },
});

export class EvmChainAdapter implements ChainAdapter {
  readonly chain: SupportedChain;
  readonly isEvm = true;
  private config: ChainConfig;
  private publicClient: PublicClient<any, any>;
  private wsClient?: PublicClient<any, any>;
  private nonceManager = NonceManager.getInstance();
  private walletManager = WalletManager.getInstance();
  private unwatchMap: Map<string, () => void> = new Map();

  constructor(chain: SupportedChain) {
    this.chain = chain;
    this.config = CHAIN_CONFIGS[chain];
    const viemChain: Chain = this.getViemChain();

    const primaryProvider = this.config.providers[0];
    if (!primaryProvider || !primaryProvider.rpcUrl) {
      throw new Error(`RPC Provider configuration missing for chain '${chain}'. Please check your .env file.`);
    }

    this.publicClient = ResilientRpcManager.createEvmClient(this.chain, viemChain);

    const wsProvider = this.config.providers.find((p) => p.supportsWs && p.wsUrl);
    if (wsProvider && wsProvider.wsUrl) {
      try {
        this.wsClient = createPublicClient({
          chain: viemChain,
          transport: webSocket(wsProvider.wsUrl),
        }) as PublicClient<any, any>;
        logger.info({ chain: this.chain, provider: wsProvider.name }, `Initialized WSS client via '${wsProvider.name}' for contract event listening`);
      } catch (err: any) {
        logger.warn({ chain: this.chain, provider: wsProvider.name, error: err.message }, 'Failed to create WebSocket client, fallback to HTTP watch');
      }
    }
  }

  private getViemChain(): Chain {
    switch (this.chain) {
      case 'ethereum':
        return mainnet as Chain;
      case 'base':
        return base as Chain;
      case 'arbitrum':
        return arbitrum as Chain;
      case 'robinhood':
        return robinhoodChain as Chain;
      default:
        return baseSepolia as Chain;
    }
  }

  /**
   * Reads NFT contract's configured SeaDrop contract address (via getSeaDrop or allowedSeaDrop)
   */
  public async resolveSeaDropContractAddress(nftContract: Hex): Promise<Hex> {
    try {
      const customSeaDrop = (await this.publicClient.readContract({
        address: nftContract,
        abi: ERC721_MINIMAL_ABI,
        functionName: 'getSeaDrop',
      })) as Hex;
      if (customSeaDrop && customSeaDrop !== '0x0000000000000000000000000000000000000000') {
        return customSeaDrop;
      }
    } catch {}

    try {
      const allowedSeaDrop = (await this.publicClient.readContract({
        address: nftContract,
        abi: parseAbi(['function allowedSeaDrop() view returns (address)']),
        functionName: 'allowedSeaDrop',
      })) as Hex;
      if (allowedSeaDrop && allowedSeaDrop !== '0x0000000000000000000000000000000000000000') {
        return allowedSeaDrop;
      }
    } catch {}

    return CANONICAL_SEADROP_CONTRACT;
  }

  /**
   * Decodes custom SeaDrop v1 errors or extracts raw revert hex bytes for manual debugging
   */
  public decodeRevertReason(err: any): string {
    if (!err) return 'Transaction execution reverted';

    // 1. Check if Viem decoded a named error directly
    if (err.errorName) {
      return `SeaDrop Error: ${err.errorName}`;
    }
    if (err.cause?.errorName) {
      return `SeaDrop Error: ${err.cause.errorName}`;
    }

    // 2. Check error signature / selector
    const sig = (err.signature || err.cause?.signature || '').toLowerCase();
    if (sig && KNOWN_SEADROP_ERROR_SELECTORS[sig]) {
      return KNOWN_SEADROP_ERROR_SELECTORS[sig];
    }

    // 3. Try decoding raw revert hex bytes using SEADROP_ERRORS_ABI and SEADROP_V1_ABI
    const rawData = err.data || err.cause?.data || err.cause?.cause?.data || err.cause?.raw;
    if (rawData && typeof rawData === 'string' && rawData.startsWith('0x') && rawData.length >= 10) {
      const prefix = rawData.slice(0, 10).toLowerCase();
      if (KNOWN_SEADROP_ERROR_SELECTORS[prefix]) {
        return KNOWN_SEADROP_ERROR_SELECTORS[prefix];
      }

      try {
        const decoded = decodeErrorResult({
          abi: SEADROP_ERRORS_ABI,
          data: rawData as Hex,
        });
        if (decoded && decoded.errorName) {
          return `SeaDrop Error: ${decoded.errorName}${decoded.args ? ` (${JSON.stringify(decoded.args)})` : ''}`;
        }
      } catch {
        // fallback
      }

      try {
        const decodedV1 = decodeErrorResult({
          abi: SEADROP_V1_ABI,
          data: rawData as Hex,
        });
        if (decodedV1 && decodedV1.errorName) {
          return `SeaDrop Error: ${decodedV1.errorName}`;
        }
      } catch {
        return `Un-decoded Contract Revert Hex: ${rawData}`;
      }
    }

    // 4. Check explicit details string
    const details = err.cause?.cause?.details || err.cause?.details || err.details;
    if (details) {
      if (/OutOfFunds/i.test(details)) {
        return 'Insufficient Funds (Wallet balance too low for mint price + gas)';
      }
      return details;
    }

    // 5. Check reason property
    if (err.reason) return `Revert Reason: ${err.reason}`;
    if (err.cause?.reason) return `Revert Reason: ${err.cause.reason}`;

    // 6. Viem shortMessage
    if (err.shortMessage) {
      const cleaned = err.shortMessage
        .replace(/An execution error occurred in the contract\.?/i, '')
        .replace(/Execution reverted with the following reason:?/i, '')
        .replace(/Transaction creation failed\.?/i, '')
        .trim();
      if (cleaned) return cleaned;
    }

    return rawData ? `Un-decoded Contract Revert Hex: ${rawData}` : 'Transaction execution reverted';
  }

  /**
   * Pre-verifies SeaDrop interface and runs simulateContract dry-run before broadcasting
   */
  async simulateMintTx(params: MintParams): Promise<{ success: boolean; result?: any; revertReason?: string; rawError?: any }> {
    const primaryProvider = this.config.providers[0];
    if (!primaryProvider || !primaryProvider.rpcUrl) {
      throw new Error(`RPC URL missing for chain '${this.chain}'. Cannot simulate transaction.`);
    }

    const rawKey = this.walletManager.getPrivateKey(params.walletAddress);
    const account = rawKey && rawKey.startsWith('0x') ? privateKeyToAccount(rawKey as Hex) : undefined;

    if (!account) {
      throw new Error(`Connected wallet address missing or invalid for ${params.walletAddress}`);
    }

    // Hard Safety Guard Check: Refuse blocked dev/test accounts
    SecurityGuard.assertSafeSigningAccount(account.address, this.chain);

    // 1. Audit parameter nftContractAddress
    const nftContract = params.contractAddress as Hex;
    if (!nftContract || nftContract === '0x0000000000000000000000000000000000000000') {
      return {
        success: false,
        revertReason: '🛑 Local Pre-Flight Validation Aborted: nftContractAddress cannot be empty or zero address.',
      };
    }

    // 2. Audit parameter minterIfNotPayer (Connected wallet address)
    const minterIfNotPayer = account.address;
    if (!minterIfNotPayer || minterIfNotPayer === '0x0000000000000000000000000000000000000000') {
      return {
        success: false,
        revertReason: '🛑 Local Pre-Flight Validation Aborted: minterIfNotPayer parameter cannot be empty or zero address.',
      };
    }

    // 3. Resolve exact SeaDrop contract address for this NFT collection
    const seaDropContract = await this.resolveSeaDropContractAddress(nftContract);

    // 4. Pre-verify target SeaDrop contract implements getPublicDrop view function
    let publicDrop: any = undefined;
    try {
      publicDrop = await this.publicClient.readContract({
        address: seaDropContract,
        abi: SEADROP_V1_ABI,
        functionName: 'getPublicDrop',
        args: [nftContract],
      });
    } catch (err: any) {
      logger.warn({ nftContract, seaDropContract, chain: this.chain, error: err.message }, 'getPublicDrop check failed');
      return {
        success: false,
        revertReason: `⚠️ Target SeaDrop contract ${seaDropContract} did not recognize NFT collection ${nftContract} (getPublicDrop view function failed).`,
      };
    }

    let mintPriceWei = BigInt(0);
    let maxTotalMintableByWallet = 10;
    let restrictFeeRecipients = false;

    if (publicDrop) {
      if (Array.isArray(publicDrop)) {
        mintPriceWei = BigInt(publicDrop[0] || 0);
        maxTotalMintableByWallet = Number(publicDrop[3] || 10);
        restrictFeeRecipients = Boolean(publicDrop[5]);
      } else if (typeof publicDrop === 'object') {
        mintPriceWei = BigInt(publicDrop.mintPrice || 0);
        maxTotalMintableByWallet = Number(publicDrop.maxTotalMintableByWallet || 10);
        restrictFeeRecipients = Boolean(publicDrop.restrictFeeRecipients);
      }
    } else if (params.mintPriceEthOrSol) {
      mintPriceWei = parseEther(params.mintPriceEthOrSol);
    }

    // 5. Dynamically resolve valid feeRecipient address via SeaDropInspector
    let feeRecipient = await SeaDropInspector.resolveValidFeeRecipient(this.publicClient, seaDropContract, nftContract);

    // If restrictFeeRecipients is true or feeRecipient is zero, attempt fallback to NFT contract owner or connected wallet
    if (feeRecipient === '0x0000000000000000000000000000000000000000') {
      try {
        const owner = (await this.publicClient.readContract({
          address: nftContract,
          abi: ERC721_MINIMAL_ABI,
          functionName: 'owner',
        })) as Hex;
        if (owner && owner !== '0x0000000000000000000000000000000000000000') {
          feeRecipient = owner;
        }
      } catch {}
    }

    // Audit parameter feeRecipient when restricted
    if (restrictFeeRecipients && feeRecipient === '0x0000000000000000000000000000000000000000') {
      return {
        success: false,
        revertReason: '🛑 Local Pre-Flight Validation Aborted: feeRecipient parameter cannot be zero address for a restricted SeaDrop drop.',
      };
    }

    // 6. Fetch current on-chain balanceOf(account.address) for connected wallet
    let onChainBalance = BigInt(0);
    try {
      onChainBalance = (await this.publicClient.readContract({
        address: nftContract,
        abi: ERC721_MINIMAL_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })) as bigint;
    } catch {}

    // 7. Compute exact total value in wei (mintPriceWei * quantity) with zero rounding errors
    const totalValueWei = mintPriceWei * BigInt(params.quantity);

    // Canonical mintPublic function selector: 0x8797f7e5 / 0x161ac21f
    const selector = toFunctionSelector('function mintPublic(address,address,address,uint256)');

    // Log explicit parameters used in mintPublic right before simulation
    logger.info(
      {
        chain: this.chain,
        seaDropContractTarget: seaDropContract,
        nftContractParameter: nftContract,
        connectedWalletAddress: account.address,
        minterIfNotPayerParameter: minterIfNotPayer,
        feeRecipientParameter: feeRecipient,
        restrictFeeRecipients,
        onChainBalance: onChainBalance.toString(),
        requestedQuantity: params.quantity,
        maxTotalMintableByWallet,
        mintPriceWei: mintPriceWei.toString(),
        totalValueWei: totalValueWei.toString(),
        selector,
        signature: 'mintPublic(address,address,address,uint256)',
      },
      'Pre-Flight SeaDrop mintPublic parameters validated and verified right before simulation'
    );

    try {
      const { result } = await this.publicClient.simulateContract({
        account: account.address, // msg.sender is connected wallet
        address: seaDropContract,
        abi: SEADROP_V1_ABI,
        functionName: 'mintPublic',
        args: [
          nftContract,
          feeRecipient,
          minterIfNotPayer, // Explicitly connected wallet address!
          BigInt(params.quantity),
        ],
        value: totalValueWei,
      });

      logger.info({ chain: this.chain, seaDropContract, nftContract }, 'Pre-flight SeaDrop simulation PASSED cleanly!');
      return { success: true, result };
    } catch (err: any) {
      const decodedReason = this.decodeRevertReason(err);

      // Log full raw revert payload & exact call parameters for deep debugging
      logger.error(
        {
          chain: this.chain,
          seaDropContractTarget: seaDropContract,
          nftContractParameter: nftContract,
          walletAddress: account.address,
          simulatedCall: {
            account: account.address,
            to: seaDropContract,
            valueWei: totalValueWei.toString(),
            quantity: params.quantity,
            functionSelector: selector,
            functionArgs: [
              nftContract,
              feeRecipient,
              minterIfNotPayer,
              params.quantity,
            ],
          },
          onChainBalance: onChainBalance.toString(),
          rawRevertData: {
            message: err.message,
            shortMessage: err.shortMessage,
            cause: err.cause,
            data: err.data || err.cause?.data,
            name: err.name,
            stack: err.stack,
          },
        },
        `Pre-flight SeaDrop simulation REVERTED on ${this.chain}: ${decodedReason}`
      );

      return {
        success: false,
        revertReason: decodedReason,
        rawError: err,
      };
    }
  }

  async watchContract(contractAddress: string, callback: (event: any) => void): Promise<void> {
    const key = contractAddress.toLowerCase();
    const clientToUse = this.wsClient || this.publicClient;
    const isWs = !!this.wsClient;

    logger.info(
      { chain: this.chain, contractAddress, mode: isWs ? 'WebSocket' : 'HTTP Polling Fallback' },
      `Subscribing to EVM contract logs (${isWs ? 'WebSocket' : 'HTTP Fallback'})`
    );

    try {
      const unwatch = clientToUse.watchEvent({
        address: contractAddress as Hex,
        onLogs: (logs) => {
          logger.info({ chain: this.chain, contractAddress, logCount: logs.length }, 'Contract state-change event log detected!');
          callback({
            type: 'EVENT_LOG_DETECTED',
            chain: this.chain,
            contractAddress,
            logs,
            timestamp: Date.now(),
          });
        },
      });

      this.unwatchMap.set(key, unwatch);
    } catch (err: any) {
      logger.warn({ chain: this.chain, error: err.message }, 'WebSocket watch Event failed');
    }
  }

  async unwatchContract(contractAddress: string): Promise<void> {
    const key = contractAddress.toLowerCase();
    const unwatch = this.unwatchMap.get(key);
    if (unwatch) {
      unwatch();
      this.unwatchMap.delete(key);
    }
  }

  async getGasEstimate(params: MintParams): Promise<GasEstimate> {
    let maxFeePerGas: bigint = parseEther('0.000000002'); // fallback 2 gwei
    let maxPriorityFeePerGas: bigint = parseEther('0.000000001'); // fallback 1 gwei

    try {
      // Fetch live EIP-1559 fee estimates from RPC provider
      const fees = await this.publicClient.estimateFeesPerGas();
      if (fees.maxFeePerGas && fees.maxPriorityFeePerGas) {
        maxFeePerGas = fees.maxFeePerGas;
        maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
      }
    } catch (err: any) {
      logger.warn({ chain: this.chain, error: err.message }, 'estimateFeesPerGas call failed, trying getGasPrice() fallback');
      try {
        const gasPrice = await this.publicClient.getGasPrice();
        maxPriorityFeePerGas = parseEther('0.000000001');
        maxFeePerGas = (gasPrice * BigInt(12)) / BigInt(10) + maxPriorityFeePerGas;
      } catch {
        // fallback to defaults
      }
    }

    const estimatedGas = BigInt(150000);
    const costWei = maxFeePerGas * estimatedGas;

    return {
      estimatedGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      estimatedCostEthOrSol: formatEther(costWei),
    };
  }

  async buildMintTx(params: MintParams): Promise<BuiltTx> {
    const primaryProvider = this.config.providers[0];
    if (!primaryProvider || !primaryProvider.rpcUrl) {
      throw new Error(`RPC URL missing for chain '${this.chain}'. Please check .env configuration.`);
    }

    const rawKey = this.walletManager.getPrivateKey(params.walletAddress);
    if (!rawKey || !rawKey.startsWith('0x')) {
      throw new Error(`Wallet private key not found for EVM address '${params.walletAddress}'. Please add your wallet via /addwallet first.`);
    }

    const account = privateKeyToAccount(rawKey as Hex);

    // Hard Safety Guard Check: Refuse blocked dev/test accounts on Mainnet
    SecurityGuard.assertSafeSigningAccount(account.address, this.chain);

    const nonce = await this.nonceManager.getNextNonce(this.chain, account.address, async () => {
      try {
        return await this.publicClient.getTransactionCount({
          address: account.address,
          blockTag: 'pending',
        });
      } catch {
        return 0;
      }
    });

    const nftContract = params.contractAddress as Hex;

    // 1. Resolve exact SeaDrop contract address for this collection
    const seaDropContract = await this.resolveSeaDropContractAddress(nftContract);

    // 2. Dynamically resolve feeRecipient via SeaDropInspector (getAllowedFeeRecipients / getFeeRecipients / owner)
    let feeRecipient = await SeaDropInspector.resolveValidFeeRecipient(this.publicClient, seaDropContract, nftContract);

    if (feeRecipient === '0x0000000000000000000000000000000000000000') {
      try {
        const owner = (await this.publicClient.readContract({
          address: nftContract,
          abi: ERC721_MINIMAL_ABI,
          functionName: 'owner',
        })) as Hex;
        if (owner && owner !== '0x0000000000000000000000000000000000000000') {
          feeRecipient = owner;
        }
      } catch {}
    }

    // Explicitly set minterIfNotPayer to connected wallet address!
    const minterIfNotPayer: Hex = account.address;

    // 3. Encode canonical SeaDrop mintPublic calldata (selector: 0x8797f7e5 / 0x161ac21f)
    const data = SeaDropInspector.encodeMintPublicCalldata(
      nftContract,        // NFT contract as Parameter 1
      feeRecipient,      // Valid fee recipient!
      minterIfNotPayer,  // Connected wallet address as minter!
      params.quantity
    );

    const selector = toFunctionSelector('function mintPublic(address,address,address,uint256)');
    logger.info(
      {
        selector,
        signature: 'mintPublic(address,address,address,uint256)',
        targetSeaDropContract: seaDropContract,
        nftContractParameter: nftContract,
        connectedWalletAddress: account.address,
        minterIfNotPayerParameter: minterIfNotPayer,
        feeRecipientParameter: feeRecipient,
      },
      'Built canonical SeaDrop mintPublic transaction payload with valid feeRecipient and connected wallet address'
    );

    const gasFees = await this.getGasEstimate(params);

    const mintPriceWei = params.mintPriceEthOrSol ? parseEther(params.mintPriceEthOrSol) : BigInt(0);
    const totalValueWei = mintPriceWei * BigInt(params.quantity);

    // Explicitly set type: 'eip1559' and required fee fields for ALL EVM chains
    const rawPayload: any = {
      type: 'eip1559',
      account: account.address,
      to: seaDropContract, // Targeted TO the SeaDrop contract, NOT the NFT contract directly!
      data,
      value: totalValueWei,
      nonce,
      gas: gasFees.estimatedGas,
      maxFeePerGas: gasFees.maxFeePerGas,
      maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
    };

    if (this.config.isFifoOnly) {
      logger.info({ chain: this.chain }, 'Robinhood Chain detected: using standard EIP-1559 fees (no priority fee bumping retries)');
    }

    const builtTx: BuiltTx = {
      id: `evm-tx-${this.chain}-${Date.now()}`,
      chain: this.chain,
      contractAddress: params.contractAddress,
      walletAddress: account.address,
      quantity: params.quantity,
      rawPayload,
      nonce,
      maxFeePerGas: gasFees.maxFeePerGas,
      maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
      isSigned: false,
      createdAt: Date.now(),
    };

    // Pre-flight check: Verify built transaction is well-formed with required EIP-1559 fee fields
    SecurityGuard.assertWellFormedTx(builtTx);

    return builtTx;
  }

  async sendTx(builtTx: BuiltTx): Promise<TxResult> {
    const primaryProvider = this.config.providers[0];
    if (!primaryProvider || !primaryProvider.rpcUrl) {
      throw new Error(`RPC Provider missing for chain '${this.chain}'. Cannot broadcast transaction.`);
    }

    const rawKey = this.walletManager.getPrivateKey(builtTx.walletAddress);
    if (!rawKey) {
      throw new Error(`Private key missing for address ${builtTx.walletAddress}`);
    }

    const account = privateKeyToAccount(rawKey as Hex);

    // Hard Safety Guard Check: Refuse blocked dev/test accounts on Mainnet
    SecurityGuard.assertSafeSigningAccount(account.address, this.chain);

    // Pre-flight Check: Refuse malformed transaction missing required fee fields
    SecurityGuard.assertWellFormedTx(builtTx);

    try {
      const viemChain = this.getViemChain();

      // Create wallet client with local account attached
      const walletClient = createWalletClient({
        account,
        chain: viemChain,
        transport: http(primaryProvider.rpcUrl),
      });

      // 1. Sign transaction LOCALLY using local account to produce raw serialized transaction hex
      const serializedTx = await walletClient.signTransaction({
        type: 'eip1559',
        account,
        chain: viemChain,
        to: builtTx.rawPayload.to,
        data: builtTx.rawPayload.data,
        value: builtTx.rawPayload.value,
        nonce: builtTx.rawPayload.nonce,
        gas: builtTx.rawPayload.gas,
        maxFeePerGas: builtTx.rawPayload.maxFeePerGas,
        maxPriorityFeePerGas: builtTx.rawPayload.maxPriorityFeePerGas,
      });

      // 2. Broadcast via eth_sendRawTransaction on the RPC node
      const hash = await this.publicClient.sendRawTransaction({ serializedTransaction: serializedTx });

      // Guarantee full 66-character tx hash
      const fullHash = hash.startsWith('0x') ? hash : `0x${hash}`;

      logger.info({ chain: this.chain, txHash: fullHash, rpc: primaryProvider.rpcUrl }, 'Real on-chain transaction locally signed and broadcasted via eth_sendRawTransaction!');

      return {
        success: true,
        txHash: fullHash,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      const decodedReason = this.decodeRevertReason(err);

      // Log full raw revert payload for deep debugging
      logger.error(
        {
          chain: this.chain,
          contractAddress: builtTx.contractAddress,
          walletAddress: builtTx.walletAddress,
          rawRevertData: {
            message: err.message,
            shortMessage: err.shortMessage,
            cause: err.cause,
            data: err.data,
            name: err.name,
            stack: err.stack,
          },
        },
        `Failed to broadcast EVM raw transaction on ${this.chain}: ${decodedReason}`
      );

      return {
        success: false,
        error: decodedReason,
        timestamp: Date.now(),
      };
    }
  }
}
