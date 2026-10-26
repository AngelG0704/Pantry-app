import app from './app.js';
import pool from './db/pool.js';
import { config } from './config.js';

const server = app.listen(config.port, () => {
    console.log(`Listening on port ${config.port} (${config.nodeEnv})`);
});

let shuttingDown = false;

function shutdown(signal) {
    if (shuttingDown){
        return;
    }

    shuttingDown = true;

    console.log(`${signal} received: closing the server`);

    const forceExit = setTimeout(() => {
        console.error('Shutdown timed out; forcing exit');
        process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
        await pool.end();
        console.log('Closed cleanly');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));