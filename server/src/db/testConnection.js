import pool from './pool.js';

const result = await pool.query('SELECT NOW() AS time, current_database() AS db');
console.log(result.rows[0]);

await pool.end();