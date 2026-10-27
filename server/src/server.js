import app from './app.js';
import pool from './db/pool.js';
import { config } from './config.js';
import { logger } from './logger.js';

const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'server listening');
});

let shuttingDown = false;

function shutdown(signal) {
    if (shuttingDown){
        return;
    }

    shuttingDown = true;

    logger.info({ signal }, 'shutting down');

    const forceExit = setTimeout(() => {
        logger.error('shutdown timed out; forcing exit');
        process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
        await pool.end();
        logger.info('closed cleanly');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
});

process.on('uncaughtException', (err)=> {
    logger.fatal({ err }, 'uncaught exception');
    process.exit(1);
});