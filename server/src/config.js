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

export const config = {
    jwtSecret,
    jwtExpiresIn: '1h',
    bcryptRounds,
};