import pg from 'pg';
import 'dotenv/config';

if (!process.env.DATABASE_URL){
    throw new Error('DATABASE_URL is not set. Check server/.env and restart');
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err)=>{
    console.error('Unexpected error on idle database client', err);
});

console.log('pool.js loaded');
export default pool;