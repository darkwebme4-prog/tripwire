import { Context, Markup } from 'telegraf';
import { MintQueueManager } from '../core/mintQueue.js';
import { WalletManager } from '../core/walletManager.js';
import { SessionKeyManager } from '../core/sessionKeyManager.js';
import { Repository } from '../db/repository.js';
import { SupportedChain } from '../chains/types.js';
import { RpcLatencyMonitor } from '../chains/rpcLatency.js';
import { SeaDropWizardHandler } from './wizard.js';
import { formatWalletsList, formatWatchedStatus, maskAddress, sanitizeLogOutput } from './formatters.js';
import pino from 'pino';

const logger = pino({ name: 'BotHandlers' });
const SUPPORTED_CHAINS: SupportedChain[] = ['ethereum', 'base', 'arbitrum', 'robinhood', 'solana'];

export const MAIN_KEYBOARD_BUTTONS = Markup.inlineKeyboard([
  [
    Markup.button.callback('💧 Add SeaDrop Drop', 'btn_seadrop_start'),
    Markup.button.callback('📡 Monitored Contracts', 'btn_status'),
  ],
  [
    Markup.button.callback('⚡ Watch Contract', 'btn_watch_info'),
    Markup.button.callback('👛 View Wallets', 'btn_wallets'),
  ],
  [
    Markup.button.callback('➕ Add Wallet', 'btn_addwallet_info'),
    Markup.button.callback('🗑️ Clear All Wallets', 'btn_clear_wallets'),
  ],
  [
    Markup.button.callback('⏸️ Pause Auto-Fire', 'btn_pauseauto'),
  ],
]);

export class BotHandlers {
  private queueManager = MintQueueManager.getInstance();
  private walletManager = WalletManager.getInstance();
  private sessionKeyManager = SessionKeyManager.getInstance();
  public wizardHandler = new SeaDropWizardHandler();

  /**
   * Command: /start or Main Menu Button
   */
  public handleStart = async (ctx: Context) => {
    try {
      const latencyRow = await RpcLatencyMonitor.getFormattedLatencyRow();
      const autoStatus = this.sessionKeyManager.isAutoPaused() ? '🔴 PAUSED' : '🟢 ACTIVE';

      await ctx.reply(
        `⚡ <b>FAST MULTI-CHAIN NFT MINTING ENGINE</b>\n\n` +
        `Monitor contracts, detect mint state flips, and fire instant sub-second mints across <b>Ethereum, Base, Arbitrum, Robinhood Chain, and Solana</b>.\n\n` +
        `📡 <b>Network Latency:</b>\n${latencyRow}\n` +
        `⚡ <b>Auto-Fire Engine:</b> <b>${autoStatus}</b>\n\n` +
        `Tap <b>💧 Add SeaDrop Drop</b> or select an action below:`,
        {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        }
      );
    } catch (err: any) {
      logger.error({ error: err.message }, 'Error in handleStart');
    }
  };

  /**
   * Command: /clearwallets or Clear All Wallets button
   */
  public handleClearWallets = async (ctx: Context) => {
    try {
      if (ctx.callbackQuery) await ctx.answerCbQuery('Clearing all wallets...').catch(() => {});
      const count = await this.walletManager.removeAllWallets();

      await ctx.reply(
        `🗑️ <b>ALL WALLETS WIPED CLEAN!</b>\n\n` +
        `Successfully removed <b>${count}</b> wallet(s) from the bot's memory and database.\n\n` +
        `Use <code>/addwallet &lt;private_key&gt;</code> to add a new wallet anytime!`,
        {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        }
      );
    } catch (error: any) {
      logger.error({ error: sanitizeLogOutput(error.message) }, 'Error clearing wallets');
      ctx.reply(`❌ Error clearing wallets: ${sanitizeLogOutput(error.message)}`, MAIN_KEYBOARD_BUTTONS);
    }
  };

  /**
   * Command: /pauseauto or Pause Auto-Fire button
   */
  public handlePauseAuto = async (ctx: Context) => {
    try {
      if (ctx.callbackQuery) await ctx.answerCbQuery('Pausing auto-fire...').catch(() => {});
      this.sessionKeyManager.pauseAutoFire();
      await ctx.reply(
        `⏸️ <b>GLOBAL AUTO-FIRE PAUSED & SESSION KEYS REVOKED!</b>\n\n` +
        `All auto-fire background jobs have been instantly frozen and active session keys revoked.\n` +
        `Contracts will fall back to manual notification mode until resumed.`,
        {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        }
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error pausing auto-fire');
    }
  };

  /**
   * Command: /resumeauto
   */
  public handleResumeAuto = async (ctx: Context) => {
    try {
      this.sessionKeyManager.resumeAutoFire();
      await ctx.reply(`▶️ <b>GLOBAL AUTO-FIRE RESUMED</b>`, { parse_mode: 'HTML', ...MAIN_KEYBOARD_BUTTONS });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error resuming auto-fire');
    }
  };

  /**
   * Catch-all for text messages to handle active wizard steps
   */
  public handleTextMessage = async (ctx: Context) => {
    const handled = await this.wizardHandler.handleTextMessage(ctx);
    if (!handled) {
      await this.handleStart(ctx);
    }
  };

  /**
   * Command: /addwallet <private_key> [label]
   */
  public handleAddWallet = async (ctx: Context) => {
    try {
      await ctx.deleteMessage().catch(() => {});

      const messageText = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const parts = messageText.trim().split(/\s+/);

      if (parts.length < 2) {
        return this.handleAddWalletInfo(ctx);
      }

      const rawPrivateKey = parts[1];
      const customLabel = parts.slice(2).join(' ') || undefined;

      const result = await this.walletManager.addWallet(rawPrivateKey, customLabel);

      await ctx.reply(
        `✅ <b>Wallet Added Successfully!</b>\n\n` +
        `🏷️ Label: <b>${result.label}</b>\n` +
        `👛 Public Address: <code>${maskAddress(result.publicAddress)}</code>\n` +
        `🌐 Chain Type: <b>${result.chainType}</b>\n\n` +
        `🔒 <i>Security Note: Your message containing the raw key was automatically deleted from Telegram chat history.</i>`,
        {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        }
      );
    } catch (error: any) {
      logger.error({ error: sanitizeLogOutput(error.message) }, 'Error in /addwallet handler');
      ctx.reply(`❌ Error adding wallet: ${sanitizeLogOutput(error.message)}`, MAIN_KEYBOARD_BUTTONS);
    }
  };

  /**
   * Button Callback: Add Wallet Info Guide
   */
  public handleAddWalletInfo = async (ctx: Context) => {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      `➕ <b>How to Add Your Wallet:</b>\n\n` +
      `Send a message in this format:\n` +
      `<code>/addwallet &lt;your_private_key&gt; [optional_label]</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>/addwallet &lt;your_64_char_hex_private_key&gt; MyMainVault</code>\n\n` +
      `🔒 <i>Your incoming message will be immediately auto-deleted from Telegram to keep your secret key safe!</i>`,
      {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD_BUTTONS,
      }
    );
  };

  /**
   * Command: /watch <contract_address> <chain>
   */
  public handleWatch = async (ctx: Context) => {
    try {
      const messageText = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const parts = messageText.trim().split(/\s+/);

      if (parts.length < 3) {
        return this.handleWatchInfo(ctx);
      }

      const contractAddress = parts[1];
      const chain = parts[2].toLowerCase() as SupportedChain;

      if (!SUPPORTED_CHAINS.includes(chain)) {
        return ctx.reply(
          `❌ Invalid chain '${chain}'. Supported chains: ${SUPPORTED_CHAINS.join(', ')}`,
          MAIN_KEYBOARD_BUTTONS
        );
      }

      await this.queueManager.watchContract(contractAddress, chain, 'MANUAL');

      await ctx.reply(
        `📡 <b>Started monitoring contract:</b>\nAddress: <code>${contractAddress}</code>\nChain: <b>${chain.toUpperCase()}</b>\nMode: <b>MANUAL NOTIFICATION</b>\nStatus: <code>MONITORING (WebSocket SpeedLayer Active)</code>`,
        {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        }
      );
    } catch (error: any) {
      logger.error({ error: sanitizeLogOutput(error.message) }, 'Error in /watch handler');
      ctx.reply(`❌ Error starting watch: ${sanitizeLogOutput(error.message)}`, MAIN_KEYBOARD_BUTTONS);
    }
  };

  /**
   * Button Callback: Watch Info Guide
   */
  public handleWatchInfo = async (ctx: Context) => {
    return this.wizardHandler.startWizard(ctx);
  };

  /**
   * Command: /mint <contract_address> <chain> <quantity> [wallet_address]
   */
  public handleMint = async (ctx: Context) => {
    try {
      const messageText = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const parts = messageText.trim().split(/\s+/);

      if (parts.length < 4) {
        return this.handleMintInfo(ctx);
      }

      const contractAddress = parts[1];
      const chain = parts[2].toLowerCase() as SupportedChain;
      const quantity = parseInt(parts[3], 10);
      const specifiedWallet = parts[4] || undefined;

      if (!SUPPORTED_CHAINS.includes(chain)) {
        return ctx.reply(`❌ Invalid chain '${chain}'. Supported chains: ${SUPPORTED_CHAINS.join(', ')}`, MAIN_KEYBOARD_BUTTONS);
      }

      if (isNaN(quantity) || quantity <= 0) {
        return ctx.reply('❌ Quantity must be a positive integer.', MAIN_KEYBOARD_BUTTONS);
      }

      const chainType = chain === 'solana' ? 'SOLANA' : 'EVM';
      let walletAddress = specifiedWallet;

      if (!walletAddress) {
        walletAddress = this.walletManager.getActiveAddress(chainType);
      }

      if (!walletAddress) {
        const activeWallets = await Repository.getActiveWallets();
        const found = activeWallets.find(w => w.chain_type === chainType);
        walletAddress = found?.public_address;
      }

      if (!walletAddress) {
        return ctx.reply(`⚠️ No wallet found for ${chainType}. Use <code>/addwallet &lt;private_key&gt;</code> to add your wallet first!`, {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        });
      }

      const { jobId, prebuilt } = await this.queueManager.queueMint(
        contractAddress,
        chain,
        quantity,
        walletAddress
      );

      const statusText = prebuilt
        ? '⚡ Transaction pre-built &amp; cached in-memory! Will broadcast instantaneously on trigger.'
        : '⏳ Queued. Will build transaction on condition trigger.';

      await ctx.reply(
        `🚀 <b>Mint Queued Successfully!</b>\n\nJob ID: <code>#${jobId}</code>\nContract: <code>${maskAddress(contractAddress)}</code>\nChain: <b>${chain.toUpperCase()}</b>\nQuantity: <b>${quantity}</b>\nWallet: <code>${maskAddress(walletAddress)}</code>\n\n${statusText}`,
        {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        }
      );
    } catch (error: any) {
      logger.error({ error: sanitizeLogOutput(error.message) }, 'Error in /mint handler');
      ctx.reply(`❌ Error queuing mint: ${sanitizeLogOutput(error.message)}`, MAIN_KEYBOARD_BUTTONS);
    }
  };

  /**
   * Button Callback: Mint Info Guide
   */
  public handleMintInfo = async (ctx: Context) => {
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      `🚀 <b>How to Queue an Instant Mint:</b>\n\n` +
      `Send a message in this format:\n` +
      `<code>/mint &lt;contract_address&gt; &lt;chain&gt; &lt;quantity&gt; [optional_wallet_address]</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>/mint 0x1234567890abcdef1234567890abcdef12345678 base 1</code>\n\n` +
      `<i>The speed layer will pre-build the transaction for your added wallet and fire the instant the mint opens!</i>`,
      {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD_BUTTONS,
      }
    );
  };

  /**
   * Command: /wallets & Button Action
   */
  public handleWallets = async (ctx: Context) => {
    try {
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
      const wallets = await Repository.getActiveWallets();
      const text = formatWalletsList(wallets);
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD_BUTTONS,
      });
    } catch (error: any) {
      logger.error({ error: sanitizeLogOutput(error.message) }, 'Error in /wallets handler');
      ctx.reply(`❌ Error listing wallets: ${sanitizeLogOutput(error.message)}`, MAIN_KEYBOARD_BUTTONS);
    }
  };

  /**
   * Command: /status & Button Action
   */
  public handleStatus = async (ctx: Context) => {
    try {
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
      const watched = await Repository.getWatchedContracts();
      const text = formatWatchedStatus(watched);
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD_BUTTONS,
      });
    } catch (error: any) {
      logger.error({ error: sanitizeLogOutput(error.message) }, 'Error in /status handler');
      ctx.reply(`❌ Error getting status: ${sanitizeLogOutput(error.message)}`, MAIN_KEYBOARD_BUTTONS);
    }
  };

  /**
   * Command: /unwatch <contract_address>
   */
  public handleUnwatch = async (ctx: Context) => {
    try {
      const messageText = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const parts = messageText.trim().split(/\s+/);

      if (parts.length < 2) {
        return ctx.reply('❌ Usage: <code>/unwatch &lt;contract_address&gt;</code>', {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        });
      }

      const contractAddress = parts[1];
      const removed = await this.queueManager.unwatchContract(contractAddress);

      if (removed) {
        await ctx.reply(`🛑 Stopped monitoring contract: <code>${contractAddress}</code>`, {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        });
      } else {
        await ctx.reply(`⚠️ Contract <code>${contractAddress}</code> was not in watch list.`, {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD_BUTTONS,
        });
      }
    } catch (error: any) {
      logger.error({ error: sanitizeLogOutput(error.message) }, 'Error in /unwatch handler');
      ctx.reply(`❌ Error unwatching contract: ${sanitizeLogOutput(error.message)}`, MAIN_KEYBOARD_BUTTONS);
    }
  };
}
