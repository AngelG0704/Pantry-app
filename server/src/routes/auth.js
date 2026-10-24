import { Router } from "express";
import { register, login, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { loginLimiter, registerLimiter } from "../middleware/rateLimiters.js";
import { validate } from "../middleware/validate.js";
import { loginBody, registerBody } from "../validation/schemas.js";

const router = Router();

router.post('/register', registerLimiter, validate({ body: registerBody }), register);
router.post('/login', loginLimiter, validate({ body:loginBody }),login);
router.get('/me', requireAuth, me);

export default router;