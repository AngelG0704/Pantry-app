import { verifyToken } from "../services/tokenService.js";

export function requireAuth(req, res, next) {
    const header = req.get('Authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token){
        return res.status(401).json({ error: 'Authentication required'});
    }

    let userId;
    try{
        ({ userId } = verifyToken(token));
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    } 

    req.user = { id: userId };
    next();
}