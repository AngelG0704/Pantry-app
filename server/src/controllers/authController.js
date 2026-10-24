import * as authService from '../services/authService.js';
import { signToken } from '../services/tokenService.js';

export async function register(req, res, next) {
    try {
        const { email, password } = req.valid.body;

        const user = await authService.registerUser(email, password);
        if (!user){
            return res.status(409).json({ error: 'Email already registered' });
        }

        res.status(201).json({ user });
    } catch (err) {
        next(err);
    }
}


export async function login(req, res, next) {
    try{
        const { email, password } = req.valid.body;
        
        const user = await authService.authenticateUser(email, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or passeword' });
        }

        res.json({ token: signToken(user.id), user});
    } catch (err){
        next(err);
    }
}

export async function me(req, res, next) {
    try{
        const user = await authService.getUserById(req.user.id);
        if (!user){
            return res.status(401).json({ error: 'Account no longer exists' });
        }
        res.json({ user });
    } catch (err){
        next(err);
    }
}