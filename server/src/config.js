import 'dotenv/config'

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
        'JWT_SECRET must be set to at least 32 characters. Check server/.env and restart'
    );
}

export const config = {
    jwtSecret,
    jwtExpiresIn: '1h',
};