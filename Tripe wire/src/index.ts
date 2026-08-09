import dotenv from 'dotenv';
import { initDatabase } from './db/index.js';
import { MintQueueManager } from './core/mintQueue.js';
import { EvmChainAdapter } from './chains/evm.js';
import { SolanaChainAdapter } from './chains/solana.js';
import { MockChainAdapter } from './chains/mock.js';
import { CHAIN_CONFIGS } from './chains/config.js';
import { ResilientRpcManager } from './chains/rpcClient.js';
import { createTelegramBot, registerBotMenuCommands } from './bot/index.js';
import pino from 'pino';

dotenv.config();

const logger = pino({ name: 'AppMain' });

async function main() {
  logger.info('Starting Multi-Chain Fast NFT Minting Bot...');

  // 1. Initialize Database
  await initDatabase();
  logger.info('Database initialized successfully.');

  // 2. Perform Startup RPC Health Check across configured providers
  await ResilientRpcManager.checkRpcHealth();

  // 3. Setup Mint Queue Manager & Chain Adapters
  const queueManager = MintQueueManager.getInstance();

  const isMockMode = process.env.USE_MOCK_ADAPTER === 'true';
  const isLiveSigning = process.env.ENABLE_LIVE_MAINNET_SIGNING === 'true';

  if (isMockMode) {
    logger.warn('⚠️ USE_MOCK_ADAPTER=true: Registering MOCK Chain Adapters for offline unit testing...');
    queueManager.registerAdapter(new MockChainAdapter('ethereum'));
    queueManager.registerAdapter(new MockChainAdapter('base'));
    queueManager.registerAdapter(new MockChainAdapter('arbitrum'));
    queueManager.registerAdapter(new MockChainAdapter('robinhood'));
    queueManager.registerAdapter(new MockChainAdapter('solana'));
  } else {
    logger.info('Registering Resilient Multi-RPC Chain Adapters (Base, Ethereum, Arbitrum, Robinhood, Solana)...');

    queueManager.registerAdapter(new EvmChainAdapter('ethereum'));
    queueManager.registerAdapter(new EvmChainAdapter('base'));
    queueManager.registerAdapter(new EvmChainAdapter('arbitrum'));
    queueManager.registerAdapter(new EvmChainAdapter('robinhood'));
    queueManager.registerAdapter(new SolanaChainAdapter());

    const execMode = isLiveSigning ? '🟢 LIVE ON-CHAIN BROADCAST' : '🟡 SIMULATION / DRY-RUN';
    logger.info(`=======================================================`);
    logger.info(`EXECUTION MODE: ${execMode}`);
    logger.info(`• Ethereum Mainnet: LIVE (Chain ID: ${CHAIN_CONFIGS.ethereum.chainId}, RPC: ${CHAIN_CONFIGS.ethereum.providers[0]?.rpcUrl})`);
    logger.info(`• Base Mainnet:     LIVE (Chain ID: ${CHAIN_CONFIGS.base.chainId}, RPC: ${CHAIN_CONFIGS.base.providers[0]?.rpcUrl})`);
    logger.info(`• Arbitrum One:     LIVE (Chain ID: ${CHAIN_CONFIGS.arbitrum.chainId}, RPC: ${CHAIN_CONFIGS.arbitrum.providers[0]?.rpcUrl})`);
    logger.info(`• Robinhood Chain:  LIVE (Chain ID: ${CHAIN_CONFIGS.robinhood.chainId}, RPC: ${CHAIN_CONFIGS.robinhood.providers[0]?.rpcUrl})`);
    logger.info(`• Solana Devnet:    LIVE (RPC: ${CHAIN_CONFIGS.solana.providers[0]?.rpcUrl})`);
    logger.info(`=======================================================`);
  }

  // 4. Launch Telegram Bot
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || botToken === 'MOCK_TELEGRAM_BOT_TOKEN') {
    logger.warn('No valid TELEGRAM_BOT_TOKEN provided in .env. Bot skeleton is configured and ready for token launch.');
    logger.info('Multi-Chain Mint Core Engine initialized and running in headless mode.');
    return;
  }

  const bot = createTelegramBot(botToken);

  // Register native Telegram command popup menu
  await registerBotMenuCommands(bot);

  logger.info('Launching Telegram Bot listener with resilient polling loop...');

  let isStopping = false;

  const startPolling = async () => {
    while (!isStopping) {
      try {
        logger.info('Starting Telegram Bot polling loop...');
        await bot.launch({
          allowedUpdates: ['message', 'callback_query'],
          dropPendingUpdates: false,
        });
        logger.info('Telegram Bot polling session started.');
        break; // If launch cleanly runs until stop
      } catch (err: any) {
        logger.error({ error: err.message }, 'Telegram Bot polling encountered an error, reconnecting in 3 seconds...');
        if (!isStopping) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
  };

  startPolling();

  // Enable graceful stop
  const gracefulStop = (signal: string) => {
    isStopping = true;
    logger.info(`Stopping Telegram Bot (${signal})...`);
    bot.stop(signal);
  };

  process.once('SIGINT', () => gracefulStop('SIGINT'));
  process.once('SIGTERM', () => gracefulStop('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Unhandled fatal application error');
  process.exit(1);
});
