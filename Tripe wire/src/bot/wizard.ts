import { Context, Markup } from 'telegraf';
import { SeaDropInspector, PublicDropInfo, SeaDropPhaseInfo } from '../chains/seadrop.js';
import { ResilientRpcManager } from '../chains/rpcClient.js';
import { CHAIN_CONFIGS } from '../chains/config.js';
import { SupportedChain } from '../chains/types.js';
import { PriceFeedService } from '../core/priceFeed.js';
import { WalletManager } from '../core/walletManager.js';
import { WalletConnectRelay } from '../core/walletConnect.js';
import { MintQueueManager } from '../core/mintQueue.js';
import { SessionKeyManager } from '../core/sessionKeyManager.js';
import { formatSeaDropSummaryCard, formatSessionKeyAuthCard, formatMultiPhaseSummary, formatTxExplorerLink, maskAddress, sanitizeLogOutput } from './formatters.js';
import { parseEther, formatEther, Hex } from 'viem';
import pino from 'pino';

const logger = pino({ name: 'SeaDropWizard' });

export interface WizardSession {
  step: 'AWAITING_ADDRESS' | 'AWAITING_CHAIN' | 'AWAITING_PHASE' | 'AWAITING_MODE' | 'AWAITING_QUANTITY' | 'AWAITING_SESSION_KEY_AUTH' | 'CONFIRMATION';
  contractAddress?: string;
  chain?: SupportedChain;
  dropInfo?: PublicDropInfo;
  detectedPhases?: SeaDropPhaseInfo[];
  selectedPhase?: SeaDropPhaseInfo;
  mode?: 'MANUAL' | 'AUTO';
  quantity?: number;
  walletAddress?: string;
  builtTx?: any;
  maxSpendWei?: bigint;
}

const userSessions: Map<number, WizardSession> = new Map();

export class SeaDropWizardHandler {
  private queueManager = MintQueueManager.getInstance();
  private walletManager = WalletManager.getInstance();
  private priceFeed = PriceFeedService.getInstance();
  private sessionKeyManager = SessionKeyManager.getInstance();

  /**
   * Starts the SeaDrop contract inspection flow
   */
  public startWizard = async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    userSessions.set(userId, { step: 'AWAITING_ADDRESS' });

    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    await ctx.reply(
      `💧 <b>SEADROP CONTRACT MINT FLOW</b>\n\n` +
      `Please paste the NFT contract address you wish to inspect and mint:\n\n` +
      `<i>Example: <code>0x1234567890abcdef1234567890abcdef12345678</code></i>`,
      { parse_mode: 'HTML' }
    );
  };

  /**
   * Processes text messages during wizard conversation
   */
  public handleTextMessage = async (ctx: Context): Promise<boolean> => {
    const userId = ctx.from?.id;
    if (!userId) return false;

    const session = userSessions.get(userId);
    if (!session) return false;

    const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text.trim() : '';
    if (!text || text.startsWith('/')) {
      userSessions.delete(userId);
      return false;
    }

    if (session.step === 'AWAITING_ADDRESS') {
      if (!text.startsWith('0x') || text.length !== 42) {
        await ctx.reply('❌ Invalid EVM contract address. Please send a 42-character address starting with <code>0x</code>.', { parse_mode: 'HTML' });
        return true;
      }

      session.contractAddress = text;
      session.step = 'AWAITING_CHAIN';

      await ctx.reply(
        `📍 Contract Address: <code>${text}</code>\n\n` +
        `Select the chain for this contract:`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('Base', 'wiz_chain_base'),
              Markup.button.callback('Ethereum', 'wiz_chain_ethereum'),
            ],
            [
              Markup.button.callback('Arbitrum', 'wiz_chain_arbitrum'),
              Markup.button.callback('Robinhood Chain', 'wiz_chain_robinhood'),
            ],
            [Markup.button.callback('❌ Cancel', 'wiz_cancel')],
          ]),
        }
      );
      return true;
    }

    return false;
  };

  /**
   * Handles chain selection button click & detects Multi-Phases + Sold-Out status
   */
  public handleChainSelect = async (ctx: Context, chain: SupportedChain) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = userSessions.get(userId);
    if (!session || !session.contractAddress) return;

    if (ctx.callbackQuery) await ctx.answerCbQuery('Inspecting SeaDrop contract phases on-chain...').catch(() => {});

    session.chain = chain;
    const chainConfig = CHAIN_CONFIGS[chain];
    const activeWallet = (this.walletManager.getActiveAddress('EVM') as Hex) || undefined;

    await ctx.reply(`🔎 Reading <code>${maskAddress(session.contractAddress)}</code> phases on <b>${chainConfig.name}</b>...`, { parse_mode: 'HTML' });

    try {
      const viemChain = chainConfig.isEvm ? (CHAIN_CONFIGS[chain] as any) : undefined;
      const client = ResilientRpcManager.createEvmClient(chain, viemChain);

      const summary = await SeaDropInspector.inspectAllPhases(client, session.contractAddress as Hex, activeWallet);
      session.dropInfo = summary.publicDrop;
      session.detectedPhases = summary.phases;

      const phaseSummaryText = formatMultiPhaseSummary(summary.publicDrop.name, summary.publicDrop.symbol, summary.phases);

      if (summary.publicDrop.isSoldOut) {
        userSessions.delete(userId);
        await ctx.reply(
          `${phaseSummaryText}\n\n` +
          `🔴 <b>COLLECTION IS SOLD OUT!</b> (${summary.publicDrop.maxSupply.toString()} / ${summary.publicDrop.maxSupply.toString()} minted)\n\n` +
          `⚠️ Minting is disabled because this collection is completely sold out.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const eligiblePhases = summary.phases.filter((p) => p.isEligible && p.isActive && !p.isSoldOut);

      if (eligiblePhases.length > 1) {
        session.step = 'AWAITING_PHASE';
        const phaseButtons = eligiblePhases.map((p) => [
          Markup.button.callback(
            `${p.isGated ? '✅' : '🟢'} ${p.name} (${p.mintPriceEth} ETH)`,
            `wiz_select_phase_${p.phaseId}`
          ),
        ]);
        phaseButtons.push([Markup.button.callback('❌ Cancel', 'wiz_cancel')]);

        await ctx.reply(
          `${phaseSummaryText}\n\n` +
          `⚡ <b>Multiple eligible phases detected!</b> Please select which phase you want to mint from:`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(phaseButtons),
          }
        );
      } else {
        session.selectedPhase = eligiblePhases[0] || summary.phases[summary.phases.length - 1];
        session.step = 'AWAITING_MODE';

        await ctx.reply(
          `${phaseSummaryText}\n\n` +
          `Selected Phase: <b>${session.selectedPhase.name}</b> (${session.selectedPhase.mintPriceEth} ETH)\n\n` +
          `Choose your mint execution mode:`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🖐️ Manual — Notify Me, I Confirm', 'wiz_mode_manual')],
              [Markup.button.callback('⚡ Auto — Instant Fire (Session Key)', 'wiz_mode_auto')],
              [Markup.button.callback('❌ Cancel', 'wiz_cancel')],
            ]),
          }
        );
      }
    } catch (err: any) {
      logger.warn({ contract: session.contractAddress, chain, error: err.message }, 'SeaDrop multi-phase inspection failed');
      userSessions.delete(userId);
      await ctx.reply(
        `⚠️ <b>Not a recognized SeaDrop contract:</b>\n${err.message}\n\n` +
        `Please verify the contract address and ensure it implements the OpenSea SeaDrop interface.`,
        { parse_mode: 'HTML' }
      );
    }
  };

  /**
   * Handles explicit Phase selection
   */
  public handlePhaseSelect = async (ctx: Context, phaseId: string) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = userSessions.get(userId);
    if (!session || !session.detectedPhases) return;

    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    const chosenPhase = session.detectedPhases.find((p) => p.phaseId === phaseId) || session.detectedPhases[0];
    session.selectedPhase = chosenPhase;
    session.step = 'AWAITING_MODE';

    await ctx.reply(
      `Selected Phase: <b>${chosenPhase.name}</b> (${chosenPhase.mintPriceEth} ETH)\n\n` +
      `Choose your mint execution mode:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🖐️ Manual — Notify Me, I Confirm', 'wiz_mode_manual')],
          [Markup.button.callback('⚡ Auto — Instant Fire (Session Key)', 'wiz_mode_auto')],
          [Markup.button.callback('❌ Cancel', 'wiz_cancel')],
        ]),
      }
    );
  };

  /**
   * Handles Mode Selection (Manual vs Auto)
   */
  public handleModeSelect = async (ctx: Context, mode: 'MANUAL' | 'AUTO') => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = userSessions.get(userId);
    if (!session || !session.dropInfo || !session.selectedPhase) return;

    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

    session.mode = mode;
    session.step = 'AWAITING_QUANTITY';
    const phase = session.selectedPhase;

    await ctx.reply(
      `Selected Phase: <b>${phase.name}</b> (${phase.mintPriceEth} ETH)\n` +
      `Selected Mode: <b>${mode === 'AUTO' ? '⚡ AUTO-FIRE (ERC-4337 Session Key)' : '🖐️ MANUAL NOTIFICATION'}</b>\n\n` +
      `Select the quantity you want to mint:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Mint 1', 'wiz_qty_1'),
            Markup.button.callback('Mint 2', 'wiz_qty_2'),
            Markup.button.callback('Mint 3', 'wiz_qty_3'),
          ],
          [
            Markup.button.callback(`Mint Max (${phase.maxTotalMintableByWallet})`, `wiz_qty_${phase.maxTotalMintableByWallet}`),
          ],
          [Markup.button.callback('❌ Cancel', 'wiz_cancel')],
        ]),
      }
    );
  };

  /**
   * Handles quantity selection & branches to Session Key Auth (Auto) or Summary Card (Manual)
   */
  public handleQuantitySelect = async (ctx: Context, quantity: number) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = userSessions.get(userId);
    if (!session || !session.contractAddress || !session.chain || !session.dropInfo || !session.selectedPhase) return;

    if (ctx.callbackQuery) await ctx.answerCbQuery('Running pre-flight contract simulation...').catch(() => {});

    session.quantity = quantity;
    const chain = session.chain;
    const drop = session.dropInfo;
    const phase = session.selectedPhase;

    let walletAddress = this.walletManager.getActiveAddress('EVM');
    if (!walletAddress) {
      userSessions.delete(userId);
      await ctx.reply('⚠️ No wallet found. Please use <code>/addwallet &lt;private_key&gt;</code> to connect your wallet first.', { parse_mode: 'HTML' });
      return;
    }
    session.walletAddress = walletAddress;

    try {
      const adapter = this.queueManager.getAdapter(chain);
      const mintParams = {
        contractAddress: session.contractAddress,
        chain,
        quantity,
        walletAddress,
        mintPriceEthOrSol: phase.mintPriceEth,
      };

      // 1. Run Pre-Flight Contract Simulation dry-run before showing summary card
      if (adapter.simulateMintTx) {
        const sim = await adapter.simulateMintTx(mintParams);
        if (!sim.success) {
          userSessions.delete(userId);
          await ctx.reply(
            `⚠️ <b>PRE-FLIGHT CONTRACT SIMULATION REVERTED!</b>\n\n` +
            `Contract: <code>${maskAddress(session.contractAddress)}</code>\n` +
            `Chain: <b>${chain.toUpperCase()}</b>\n` +
            `Decoded Reason: <code>${sim.revertReason || 'Transaction call reverted'}</code>\n\n` +
            `🛑 <i>Transaction aborted BEFORE sending to save gas.</i>`,
            { parse_mode: 'HTML' }
          );
          return;
        }
      }

      const gasEst = await adapter.getGasEstimate(mintParams);
      const gasEthNum = Number(gasEst.estimatedCostEthOrSol);
      const gasEthStr = gasEthNum.toFixed(5);
      const gasUsdStr = await this.priceFeed.formatUsdValue(gasEthNum, 'ETH');

      const mintPriceEthNum = Number(phase.mintPriceEth) * quantity;
      const totalEthNum = mintPriceEthNum + gasEthNum;
      const totalEthStr = totalEthNum.toFixed(5);
      const totalUsdStr = await this.priceFeed.formatUsdValue(totalEthNum, 'ETH');

      session.maxSpendWei = parseEther(totalEthStr) + parseEther('0.002');

      if (session.mode === 'AUTO') {
        session.step = 'AWAITING_SESSION_KEY_AUTH';
        const authCard = formatSessionKeyAuthCard(
          session.contractAddress,
          chain,
          formatEther(session.maxSpendWei),
          24
        );

        await ctx.reply(authCard, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔑 Authorize & Enable Auto-Fire', 'wiz_auth_session_key')],
            [Markup.button.callback('❌ Cancel', 'wiz_cancel')],
          ]),
        });
        return;
      }

      // Manual Mode summary card
      const builtTx = await adapter.buildMintTx(mintParams);
      session.builtTx = builtTx;
      session.step = 'CONFIRMATION';

      const summaryCard = formatSeaDropSummaryCard(
        drop,
        chain,
        quantity,
        walletAddress,
        gasEthStr,
        gasUsdStr,
        totalEthStr,
        totalUsdStr,
        phase.name
      );

      await ctx.reply(summaryCard, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🚀 Confirm REAL Mainnet Mint', 'wiz_confirm_mint')],
          [Markup.button.callback('❌ Cancel', 'wiz_cancel')],
        ]),
      });
    } catch (err: any) {
      logger.error({ error: sanitizeLogOutput(err.message) }, 'Error building SeaDrop summary');
      userSessions.delete(userId);
      await ctx.reply(`❌ Error preparing mint card: ${sanitizeLogOutput(err.message)}`);
    }
  };

  /**
   * Authorizes ERC-4337 Session Key for Auto-Fire Mode
   */
  public handleAuthorizeSessionKey = async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = userSessions.get(userId);
    if (!session || !session.contractAddress || !session.chain || !session.walletAddress || !session.maxSpendWei) return;

    if (ctx.callbackQuery) await ctx.answerCbQuery('Generating ERC-4337 Session Key...').catch(() => {});

    try {
      const sessionKeyRecord = await this.sessionKeyManager.generateSessionKey(
        session.walletAddress,
        session.contractAddress,
        session.chain,
        session.maxSpendWei,
        24,
        'mintPublic'
      );

      await this.queueManager.watchContract(
        session.contractAddress,
        session.chain,
        'AUTO',
        sessionKeyRecord.session_key_id
      );

      userSessions.delete(userId);

      await ctx.reply(
        `⚡ <b>AUTO-FIRE MODE ACTIVATED!</b>\n\n` +
        `📍 Target Contract: <code>${maskAddress(session.contractAddress)}</code>\n` +
        `🌐 Chain: <b>${session.chain.toUpperCase()}</b>\n` +
        `🏷️ Selected Phase: <b>${session.selectedPhase?.name || 'Public'}</b>\n` +
        `🔑 Session Key ID: <code>${sessionKeyRecord.session_key_id}</code>\n` +
        `🎯 Scoped Function: <code>mintPublic</code> ONLY\n` +
        `💰 Max Spend Cap: <b>${formatEther(session.maxSpendWei)} ETH</b>\n` +
        `⏳ Expires in: <b>24 Hours</b>\n\n` +
        `🚀 <i>The speed layer will automatically fire the instant mint condition goes live on-chain!</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (err: any) {
      logger.error({ error: sanitizeLogOutput(err.message) }, 'Error authorizing session key');
      userSessions.delete(userId);
      await ctx.reply(`❌ Error setting up session key: ${sanitizeLogOutput(err.message)}`);
    }
  };

  /**
   * Final Step for Manual Mode: Confirms mint and outputs non-custodial unsigned tx payload
   */
  public handleConfirmMint = async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = userSessions.get(userId);
    if (!session || !session.builtTx || !session.chain) return;

    if (ctx.callbackQuery) await ctx.answerCbQuery('Preparing non-custodial transaction...').catch(() => {});

    try {
      const adapter = this.queueManager.getAdapter(session.chain);
      const unsignedPayload = WalletConnectRelay.prepareUnsignedTx(session.builtTx);

      const txResult = await adapter.sendTx(session.builtTx);
      userSessions.delete(userId);

      if (txResult.success && txResult.txHash) {
        const explorerUrl = formatTxExplorerLink(session.chain, txResult.txHash);

        await ctx.reply(
          `🚀 <b>TRANSACTION SUBMITTED TO NETWORK!</b>\n\n` +
          `Tx Hash: <code>${txResult.txHash}</code>\n` +
          `Block Explorer: <a href="${explorerUrl}">View on Explorer</a>\n\n` +
          `⏳ <i>Polling for on-chain block confirmation...</i>`,
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
        );

        WalletConnectRelay.pollConfirmation(session.chain, txResult.txHash, async (status) => {
          if (status.success) {
            await ctx.reply(
              `✅ <b>MINT CONFIRMED ON-CHAIN!</b>\n\n` +
              `Block #${status.blockNumber?.toString() || 'Included'}\n` +
              `Tx Hash: <code>${txResult.txHash}</code>\n` +
              `View: <a href="${explorerUrl}">Explorer Receipt</a>`,
              { parse_mode: 'HTML' }
            );
          } else {
            const decodedReason = status.error || 'Transaction execution reverted';
            await ctx.reply(
              `❌ <b>TRANSACTION REVERTED ON-CHAIN</b>\n\n` +
              `Reason: <code>${decodedReason}</code>\n` +
              `Tx Hash: <code>${txResult.txHash}</code>`,
              { parse_mode: 'HTML' }
            );
          }
        });
      } else {
        const decodedReason = txResult.error || 'Transaction broadcast failed';
        await ctx.reply(`❌ Mint submission failed: ${decodedReason}`);
      }
    } catch (err: any) {
      logger.error({ error: sanitizeLogOutput(err.message) }, 'Error executing confirm mint');
      userSessions.delete(userId);
      await ctx.reply(`❌ Error broadcasting transaction: ${sanitizeLogOutput(err.message)}`);
    }
  };

  /**
   * Resets wizard session
   */
  public handleCancel = async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (userId) userSessions.delete(userId);
    if (ctx.callbackQuery) await ctx.answerCbQuery('Mint flow cancelled').catch(() => {});
    await ctx.reply('❌ Mint flow cancelled.');
  };
}
