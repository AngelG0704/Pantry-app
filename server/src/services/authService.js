import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { config } from '../config.js'

const SALT_ROUNDS = config.bcryptRounds;
const DUMMY_HASH = await bcrypt.hash('not-a-real-password', SALT_ROUNDS);

function toUser(row) {
    return { id: row.id, email: row.email, createdAt: row.createdAt };
}

export async function registerUser(email, password) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    try{
        const result = await pool.query(
            `INSERT INTO users (email, password_hash)
             VALUES ($1, $2)
             RETURNING id, email, created_at`,
             [email, passwordHash]
        );
        return toUser(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return null;
        }
        throw err;
    }
}

export async function authenticateUser(email, password) {
    const result = await pool.query(
        'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
        [email]
    );
    const row =  result.rows[0];

    const matches = await bcrypt.compare(
        password,
        row ? row.password_hash : DUMMY_HASH
    );

    if (!row || !matches){
        return null;
    }
    return toUser(row);
}

export async function getUserById(id) {
    const result = await pool.query(
        'SELECT id, email, created_at FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
}