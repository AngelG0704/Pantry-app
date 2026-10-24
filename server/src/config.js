import 'dotenv/config'

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
        'JWT_SECRET must be set to at least 32 characters. Check server/.env and restart'
    );
}

const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

if (!Number.isInteger(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 15){
    throw new Error('BCRYPT_ROUNDS must be an integer from 4 to 15');
}

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

for (const origin of corsOrigins){
    let parased = null;
    try{
        parased = new URL(origin);
    } catch {

    }

    if (!parased || parased.origin !== origin) {
        throw new Error(
            `CORS_ORIGINS must be a comma-seperated list of origins like http://localhost:5173 (no path, no trailing slash, no wildcard). Got: "${origin}"`
        );
    }
}

function readPositiveInteger(name, fallback) {
    const value = Number(process.env[name] ?? fallback);

    if (!Number.isInteger(value) || value < 1){
        throw new Error(`${name} must be a postitve integer.`); 
    }
    return value;
}

const trustPoxy = Number(process.env.TRUST_PROXY ?? 0);

if (!Number.isInteger(trustPoxy) || trustPoxy < 0 || trustPoxy > 5){
    throw new Error('TRUST_PROXY must be an integer from 0 to 5 (the number of proxies in front of the app).');
}

export const config = {
    jwtSecret,
    jwtExpiresIn: '1h',
    bcryptRounds,
    corsOrigins,
    trustPoxy,
    rateLimits: {
        general: readPositiveInteger('RATE_LIMIT_GENERAL_MAX', 300),
        login: readPositiveInteger('RATE_LIMIT_LOGIN_MAX', 10),
        register: readPositiveInteger('RATE_LIMIT_REGISTER_MAX', 20),
    },
};