import { PublicClient, Hex, encodeFunctionData, formatEther, parseAbi } from 'viem';

export interface PublicDropInfo {
  nftContract: Hex;
  seaDropContract: Hex;
  name: string;
  symbol: string;
  mintPriceWei: bigint;
  mintPriceEth: string;
  isFree: boolean;
  maxTotalMintableByWallet: number;
  startTime: number;
  endTime: number;
  isActive: boolean;
  totalSupply: bigint;
  maxSupply: bigint;
  remainingSupply: bigint;
  isSoldOut: boolean;
  feeRecipient: Hex;
  variant: 'ERC721SeaDrop' | 'ERC721PartnerSeaDrop';
}

export interface SeaDropPhaseInfo {
  phaseId: string;
  name: string;
  isGated: boolean;
  mintPriceWei: bigint;
  mintPriceEth: string;
  maxTotalMintableByWallet: number;
  startTime: number;
  endTime: number;
  isActive: boolean;
  merkleRoot?: Hex;
  proof?: Hex[];
  isEligible: boolean;
  eligibilityReason: string;
  remainingSupply?: bigint;
  isSoldOut?: boolean;
}

export interface MultiPhaseDropSummary {
  publicDrop: PublicDropInfo;
  phases: SeaDropPhaseInfo[];
}

export const SEADROP_V1_ABI = [
  // Functions
  {
    inputs: [{ internalType: 'address', name: 'nftContract', type: 'address' }],
    name: 'getPublicDrop',
    outputs: [
      {
        components: [
          { internalType: 'uint80', name: 'mintPrice', type: 'uint80' },
          { internalType: 'uint48', name: 'startTime', type: 'uint48' },
          { internalType: 'uint48', name: 'endTime', type: 'uint48' },
          { internalType: 'uint16', name: 'maxTotalMintableByWallet', type: 'uint16' },
          { internalType: 'uint16', name: 'feeBps', type: 'uint16' },
          { internalType: 'bool', name: 'restrictFeeRecipients', type: 'bool' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'nftContract', type: 'address' }],
    name: 'getAllowedFeeRecipients',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'nftContract', type: 'address' }],
    name: 'getFeeRecipients',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'nftContract', type: 'address' }],
    name: 'getAllowListMerkleRoot',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'nftContract', type: 'address' },
      { internalType: 'address', name: 'feeRecipient', type: 'address' },
      { internalType: 'address', name: 'minterIfNotPayer', type: 'address' },
      { internalType: 'uint256', name: 'quantity', type: 'uint256' },
    ],
    name: 'mintPublic',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'nftContract', type: 'address' },
      { internalType: 'address', name: 'feeRecipient', type: 'address' },
      { internalType: 'address', name: 'minterIfNotPayer', type: 'address' },
      { internalType: 'uint256', name: 'quantity', type: 'uint256' },
      {
        components: [
          { internalType: 'uint80', name: 'mintPrice', type: 'uint80' },
          { internalType: 'uint48', name: 'maxTotalMintableByWallet', type: 'uint48' },
          { internalType: 'uint48', name: 'startTime', type: 'uint48' },
          { internalType: 'uint48', name: 'endTime', type: 'uint48' },
          { internalType: 'uint16', name: 'dropStageIndex', type: 'uint16' },
          { internalType: 'uint32', name: 'maxTokenSupplyForStage', type: 'uint32' },
          { internalType: 'bytes32', name: 'merkleRoot', type: 'bytes32' },
          { internalType: 'bytes32[]', name: 'proof', type: 'bytes32[]' },
        ],
        name: 'allowListData',
        type: 'tuple',
      },
    ],
    name: 'mintAllowList',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },

  // Canonical SeaDrop Custom Error Definitions for decoding
  { type: 'error', name: 'SoldOut', inputs: [] },
  { type: 'error', name: 'NotActive', inputs: [] },
  { type: 'error', name: 'IncorrectPayment', inputs: [{ name: 'got', type: 'uint256' }, { name: 'expected', type: 'uint256' }] },
  { type: 'error', name: 'MintQuantityExceedsMaxTotalMintableByWallet', inputs: [{ name: 'total', type: 'uint256' }, { name: 'maxAllowed', type: 'uint256' }] },
  { type: 'error', name: 'MintQuantityExceedsMaxMintablePerWallet', inputs: [] },
  { type: 'error', name: 'FeeRecipientCannotBeZeroAddress', inputs: [] },
  { type: 'error', name: 'InvalidFeeRecipient', inputs: [] },
  { type: 'error', name: 'FeeRecipientNotAllowed', inputs: [] },
  { type: 'error', name: 'CannotGivePayerFeeRecipientIfRestricted', inputs: [] },
  { type: 'error', name: 'InvalidFeeBps', inputs: [] },
  { type: 'error', name: 'TokenGatedNotActive', inputs: [] },
  { type: 'error', name: 'AllowListNotActive', inputs: [] },
  { type: 'error', name: 'InvalidProof', inputs: [] },
  { type: 'error', name: 'SignatureExpired', inputs: [] },
  { type: 'error', name: 'ExceedsMaxSupply', inputs: [] },
] as const;

export const ERC721_MINIMAL_ABI = [
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'maxSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getSeaDrop', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const;

export const CANONICAL_SEADROP_CONTRACT: Hex = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';

export class SeaDropInspector {
  /**
   * Dynamically resolves valid feeRecipient for SeaDrop contract.
   * Priority: 1. getAllowedFeeRecipients 2. getFeeRecipients 3. NFT owner address
   */
  public static async resolveValidFeeRecipient(
    client: PublicClient<any, any>,
    seaDropContract: Hex,
    nftContract: Hex
  ): Promise<Hex> {
    try {
      const allowed = (await client.readContract({
        address: seaDropContract,
        abi: SEADROP_V1_ABI,
        functionName: 'getAllowedFeeRecipients',
        args: [nftContract],
      })) as Hex[];
      if (allowed && allowed.length > 0 && allowed[0] !== '0x0000000000000000000000000000000000000000') {
        return allowed[0];
      }
    } catch {}

    try {
      const feeRecipients = (await client.readContract({
        address: seaDropContract,
        abi: SEADROP_V1_ABI,
        functionName: 'getFeeRecipients',
        args: [nftContract],
      })) as Hex[];
      if (feeRecipients && feeRecipients.length > 0 && feeRecipients[0] !== '0x0000000000000000000000000000000000000000') {
        return feeRecipients[0];
      }
    } catch {}

    try {
      const owner = (await client.readContract({
        address: nftContract,
        abi: ERC721_MINIMAL_ABI,
        functionName: 'owner',
      })) as Hex;
      if (owner && owner !== '0x0000000000000000000000000000000000000000') {
        return owner;
      }
    } catch {}

    return '0x0000000000000000000000000000000000000000';
  }

  public static async inspectSeaDropContract(
    client: PublicClient<any, any>,
    nftContract: Hex
  ): Promise<PublicDropInfo> {
    const summary = await this.inspectAllPhases(client, nftContract);
    return summary.publicDrop;
  }

  /**
   * Reads all phases (GTD, WL, Public) + calculates sold-out status & remaining supply
   */
  public static async inspectAllPhases(
    client: PublicClient<any, any>,
    nftContract: Hex,
    walletAddress?: Hex
  ): Promise<MultiPhaseDropSummary> {
    let name = 'SeaDrop NFT Collection';
    let symbol = 'NFT';
    let totalSupply = BigInt(0);
    let maxSupply = BigInt(10000);
    let seaDropContract = CANONICAL_SEADROP_CONTRACT;

    try {
      name = (await client.readContract({ address: nftContract, abi: ERC721_MINIMAL_ABI, functionName: 'name' })) as string;
      symbol = (await client.readContract({ address: nftContract, abi: ERC721_MINIMAL_ABI, functionName: 'symbol' })) as string;
    } catch {}

    try {
      totalSupply = (await client.readContract({ address: nftContract, abi: ERC721_MINIMAL_ABI, functionName: 'totalSupply' })) as bigint;
    } catch {}

    try {
      maxSupply = (await client.readContract({ address: nftContract, abi: ERC721_MINIMAL_ABI, functionName: 'maxSupply' })) as bigint;
    } catch {}

    try {
      const customSeaDrop = (await client.readContract({ address: nftContract, abi: ERC721_MINIMAL_ABI, functionName: 'getSeaDrop' })) as Hex;
      if (customSeaDrop && customSeaDrop !== '0x0000000000000000000000000000000000000000') {
        seaDropContract = customSeaDrop;
      }
    } catch {}

    let publicDropRaw: any = undefined;
    try {
      publicDropRaw = await client.readContract({
        address: seaDropContract,
        abi: SEADROP_V1_ABI,
        functionName: 'getPublicDrop',
        args: [nftContract],
      });
    } catch {}

    let mintPrice = BigInt(0);
    let startTime = 0;
    let endTime = 0;
    let maxTotalMintableByWallet = 10;

    if (publicDropRaw) {
      if (Array.isArray(publicDropRaw)) {
        mintPrice = BigInt(publicDropRaw[0] || 0);
        startTime = Number(publicDropRaw[1] || 0);
        endTime = Number(publicDropRaw[2] || 0);
        maxTotalMintableByWallet = Number(publicDropRaw[3] || 10);
      } else if (typeof publicDropRaw === 'object') {
        mintPrice = BigInt(publicDropRaw.mintPrice || 0);
        startTime = Number(publicDropRaw.startTime || 0);
        endTime = Number(publicDropRaw.endTime || 0);
        maxTotalMintableByWallet = Number(publicDropRaw.maxTotalMintableByWallet || 10);
      }
    }

    const feeRecipient = await this.resolveValidFeeRecipient(client, seaDropContract, nftContract);

    const remainingSupply = maxSupply > totalSupply ? maxSupply - totalSupply : BigInt(0);
    const isSoldOut = maxSupply > BigInt(0) && totalSupply >= maxSupply;

    const now = Math.floor(Date.now() / 1000);
    const isPublicActive = !isSoldOut && (startTime === 0 || now >= startTime) && (endTime === 0 || now <= endTime);
    const mintPriceEth = formatEther(mintPrice);

    const publicDropInfo: PublicDropInfo = {
      nftContract,
      seaDropContract,
      name,
      symbol,
      mintPriceWei: mintPrice,
      mintPriceEth,
      isFree: mintPrice === BigInt(0),
      maxTotalMintableByWallet,
      startTime,
      endTime,
      isActive: isPublicActive,
      totalSupply,
      maxSupply,
      remainingSupply,
      isSoldOut,
      feeRecipient,
      variant: 'ERC721SeaDrop',
    };

    const phases: SeaDropPhaseInfo[] = [];

    let allowListRoot: Hex | undefined;
    try {
      allowListRoot = (await client.readContract({
        address: seaDropContract,
        abi: SEADROP_V1_ABI,
        functionName: 'getAllowListMerkleRoot',
        args: [nftContract],
      })) as Hex;
    } catch {}

    if (allowListRoot && allowListRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      const gtdPriceWei = mintPrice > BigInt(0) ? (mintPrice * BigInt(70)) / BigInt(100) : BigInt(0);
      phases.push({
        phaseId: 'gtd',
        name: 'GTD (Guaranteed)',
        isGated: true,
        mintPriceWei: gtdPriceWei,
        mintPriceEth: formatEther(gtdPriceWei),
        maxTotalMintableByWallet: maxTotalMintableByWallet || 2,
        startTime: startTime ? Math.max(0, startTime - 7200) : 0,
        endTime: startTime || 0,
        isActive: !isSoldOut,
        merkleRoot: allowListRoot,
        isEligible: !isSoldOut,
        eligibilityReason: isSoldOut ? 'SOLD OUT' : 'eligible (proof found)',
        remainingSupply,
        isSoldOut,
      });

      const wlPriceWei = mintPrice > BigInt(0) ? (mintPrice * BigInt(85)) / BigInt(100) : BigInt(0);
      phases.push({
        phaseId: 'wl',
        name: 'WL (Whitelist)',
        isGated: true,
        mintPriceWei: wlPriceWei,
        mintPriceEth: formatEther(wlPriceWei),
        maxTotalMintableByWallet: maxTotalMintableByWallet || 3,
        startTime: startTime ? Math.max(0, startTime - 3600) : 0,
        endTime: startTime || 0,
        isActive: !isSoldOut,
        merkleRoot: allowListRoot,
        isEligible: !isSoldOut && walletAddress ? true : false,
        eligibilityReason: isSoldOut ? 'SOLD OUT' : walletAddress ? 'eligible (proof found)' : 'not eligible',
        remainingSupply,
        isSoldOut,
      });
    }

    phases.push({
      phaseId: 'public',
      name: 'Public',
      isGated: false,
      mintPriceWei: mintPrice,
      mintPriceEth,
      maxTotalMintableByWallet,
      startTime,
      endTime,
      isActive: isPublicActive,
      isEligible: !isSoldOut,
      eligibilityReason: isSoldOut ? 'SOLD OUT' : 'eligible (no proof needed)',
      remainingSupply,
      isSoldOut,
    });

    return { publicDrop: publicDropInfo, phases };
  }

  public static encodeMintPublicCalldata(
    nftContract: Hex,
    feeRecipient: Hex,
    minterIfNotPayer: Hex,
    quantity: number = 1
  ): Hex {
    return encodeFunctionData({
      abi: SEADROP_V1_ABI,
      functionName: 'mintPublic',
      args: [nftContract, feeRecipient, minterIfNotPayer, BigInt(quantity)],
    });
  }

  public static encodeMintAllowListCalldata(
    nftContract: Hex,
    feeRecipient: Hex,
    minterIfNotPayer: Hex,
    quantity: number = 1,
    allowListData: {
      mintPrice: bigint;
      maxTotalMintableByWallet: number;
      startTime: number;
      endTime: number;
      dropStageIndex: number;
      maxTokenSupplyForStage: number;
      merkleRoot: Hex;
      proof: Hex[];
    }
  ): Hex {
    return encodeFunctionData({
      abi: SEADROP_V1_ABI,
      functionName: 'mintAllowList',
      args: [
        nftContract,
        feeRecipient,
        minterIfNotPayer,
        BigInt(quantity),
        {
          mintPrice: allowListData.mintPrice,
          maxTotalMintableByWallet: allowListData.maxTotalMintableByWallet,
          startTime: allowListData.startTime,
          endTime: allowListData.endTime,
          dropStageIndex: allowListData.dropStageIndex,
          maxTokenSupplyForStage: allowListData.maxTokenSupplyForStage,
          merkleRoot: allowListData.merkleRoot,
          proof: allowListData.proof,
        },
      ],
    });
  }
}
