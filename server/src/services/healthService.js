import pool from "../db/pool.js";

export async function isDatabaseUp() {
    let timer;

    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 2000);
    });

    try {
        await Promise.race([pool.query('SELECT 1'), timeout]);
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}