import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(userId) {
    return jwt.sign({}, config.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: config.jwtExpiresIn,
        subject: String(userId),
    });
}

export function verifyToken(token) {
    const payload = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'],
    });
    return { userId: Number(payload.sub) };
}