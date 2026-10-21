import * as authService from '../services/authService.js';
import { signToken } from '../services/tokenService.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCredentials(body) {
    const { email, password } = body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string'){
        return null;
    }
    return { email: email.trim().toLowerCase(), password };
}

export async function register(req, res, next) {
    try {
        const credentials = readCredentials(req.body);
        if (!credentials) {
            return res.status(400).json({ error: 'email and password are required'});
        }

        const { email, password}  = credentials;

        if(email.length > 254 || !EMAIL_PATTERN.test(email)) {
            return res.status(400).json({ error: 'A valid email is required' });
        }
        if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
            return res.status(400).json({ 
                error: 'Password must be at least 8 characters and at most 72 bytes',
            });            
        }

        const user = await authService.registerUser(email, password);
        if (!user) {
            return res.status(409).json({ error: 'Email already registered' })
        }

        res.status(201).json({ user });
    } catch (err) {
        next(err);
    }
}


export async function login(req, res, next) {
    try{
        const credientals = readCredentials(req.body);
        if (!credientals) {
            return res.status(400).json({ 
                error: 'email and password are required' 
            });
        }

        const user = await authService.authenticateUser(
            credientals.email,
            credientals.password
        );
        if (!user){
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        res.json({
            token: signToken(user.id), user
        });

    } catch (err){
        next(err);
    }
}

export async function me(req, res, next) {
    try{
        const user = await authService.getUserById(req.user.id);
        if (!user){
            return res.status(401).json({ 
                error: 'Account no longer exists' 
            });
        }
        res.json({ user });
    } catch (err){
        next(err);
    }
}