import * as healthService from '../services/healthService.js';

export async function getHealth(req, res) {
    const databaseUp = await healthService.isDatabaseUp();

    if (!databaseUp) {
        return res.status(503).json({ status: 'degraded', database: 'down' });
    }

    res.json({ status: 'ok', database: 'up' });
}