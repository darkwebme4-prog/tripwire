import { Telegraf } from 'telegraf';
import { BotHandlers } from './handlers.js';
import pino from 'pino';

const logger = pino({ name: 'TelegramBot' });

export function createTelegramBot(token: string): Telegraf {
  const bot = new Telegraf(token);
  const handlers = new BotHandlers();

  // Command handlers
  bot.command('start', handlers.handleStart);
  bot.command('addwallet', handlers.handleAddWallet);
  bot.command('wallets', handlers.handleWallets);
  bot.command('clearwallets', handlers.handleClearWallets);
  bot.command('watch', handlers.handleWatch);
  bot.command('mint', handlers.handleMint);
  bot.command('status', handlers.handleStatus);
  bot.command('unwatch', handlers.handleUnwatch);
  bot.command('pauseauto', handlers.handlePauseAuto);
  bot.command('resumeauto', handlers.handleResumeAuto);

  // Interactive Inline Keyboard Action Listeners
  bot.action('btn_status', handlers.handleStatus);
  bot.action('btn_wallets', handlers.handleWallets);
  bot.action('btn_clear_wallets', handlers.handleClearWallets);
  bot.action('btn_addwallet_info', handlers.handleAddWalletInfo);
  bot.action('btn_watch_info', handlers.handleWatchInfo);
  bot.action('btn_mint_info', handlers.handleMintInfo);
  bot.action('btn_pauseauto', handlers.handlePauseAuto);

  // SeaDrop & Auto-Fire Wizard Action Listeners
  bot.action('btn_seadrop_start', handlers.wizardHandler.startWizard);
  bot.action('wiz_chain_base', (ctx) => handlers.wizardHandler.handleChainSelect(ctx, 'base'));
  bot.action('wiz_chain_ethereum', (ctx) => handlers.wizardHandler.handleChainSelect(ctx, 'ethereum'));
  bot.action('wiz_chain_arbitrum', (ctx) => handlers.wizardHandler.handleChainSelect(ctx, 'arbitrum'));
  bot.action('wiz_chain_robinhood', (ctx) => handlers.wizardHandler.handleChainSelect(ctx, 'robinhood'));

  // Multi-Phase Selection Action Listener
  bot.action(/^wiz_select_phase_(.+)$/, (ctx) => {
    const phaseId = ctx.match[1];
    return handlers.wizardHandler.handlePhaseSelect(ctx, phaseId);
  });

  bot.action('wiz_mode_manual', (ctx) => handlers.wizardHandler.handleModeSelect(ctx, 'MANUAL'));
  bot.action('wiz_mode_auto', (ctx) => handlers.wizardHandler.handleModeSelect(ctx, 'AUTO'));

  bot.action('wiz_qty_1', (ctx) => handlers.wizardHandler.handleQuantitySelect(ctx, 1));
  bot.action('wiz_qty_2', (ctx) => handlers.wizardHandler.handleQuantitySelect(ctx, 2));
  bot.action('wiz_qty_3', (ctx) => handlers.wizardHandler.handleQuantitySelect(ctx, 3));
  bot.action(/^wiz_qty_(\d+)$/, (ctx) => {
    const qty = parseInt(ctx.match[1], 10) || 1;
    return handlers.wizardHandler.handleQuantitySelect(ctx, qty);
  });

  bot.action('wiz_auth_session_key', handlers.wizardHandler.handleAuthorizeSessionKey);
  bot.action('wiz_confirm_mint', handlers.wizardHandler.handleConfirmMint);
  bot.action('wiz_cancel', handlers.wizardHandler.handleCancel);

  // Catch-all text handler for active conversation wizard steps
  bot.on('text', handlers.handleTextMessage);

  bot.catch((err: any, ctx) => {
    logger.error({ err: err.message, updateType: ctx.updateType }, 'Unhandled Telegraf bot error safely caught');
  });

  return bot;
}

/**
 * Registers native Telegram command menu buttons with BotFather / Telegram API
 */
export async function registerBotMenuCommands(bot: Telegraf): Promise<void> {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Open interactive main menu with buttons' },
      { command: 'addwallet', description: 'Add your own wallet private key' },
      { command: 'wallets', description: 'List configured wallets (masked addresses)' },
      { command: 'clearwallets', description: 'Remove and wipe all wallets' },
      { command: 'watch', description: 'Monitor contract for mint availability' },
      { command: 'mint', description: 'Queue an instant fast mint job' },
      { command: 'pauseauto', description: 'Instantly pause all auto-fire jobs' },
      { command: 'unwatch', description: 'Stop monitoring a contract' },
    ]);
    logger.info('Successfully registered native Telegram menu commands list');
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Failed to set Telegram menu commands');
  }
}
