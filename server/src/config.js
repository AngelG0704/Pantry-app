import 'dotenv/config'

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const jwtSecret = process.env.JWT_SECRET;


if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
        'JWT_SECRET must be set to at least 32 characters. Check server/.env and restart'
    );
}

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
}

const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

if (!Number.isInteger(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 15){
    throw new Error('BCRYPT_ROUNDS must be an integer from 4 to 15');
}

if (isProduction && bcryptRounds < 10){
    throw new Error('BCRYPT_ROUNDS must be at least 10 in production.');
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
            `CORS_ORIGINS must be a comma-separated list of origins like http://localhost:5173 (no path, no trailing slash, no wildcard). Got: "${origin}"`
        );
    }
}

if (isProduction) {
    if (!process.env.CORS_ORIGINS) {
        throw new Error('CORS_ORIGINS must be set explicitly in production.');
    }

    const insecure = corsOrigins.filter((origin) => !origin.startsWith('https://'));

    if (insecure.length > 0){
        throw new Error(
            `In production, CORS_ORIGINS must use https:// origins. Got: ${insecure.join(', ')}`
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

const trustProxy = Number(process.env.TRUST_PROXY ?? 0);

if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5){
    throw new Error('TRUST_PROXY must be an integer from 0 to 5 (the number of proxies in front of the app).');
}

export const config = {
    nodeEnv,
    isProduction,
    port,
    jwtSecret,
    jwtExpiresIn: '1h',
    bcryptRounds,
    corsOrigins,
    trustProxy,
    rateLimits: {
        general: readPositiveInteger('RATE_LIMIT_GENERAL_MAX', 300),
        login: readPositiveInteger('RATE_LIMIT_LOGIN_MAX', 10),
        register: readPositiveInteger('RATE_LIMIT_REGISTER_MAX', 20),
    },
};