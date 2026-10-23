import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import pool from '../src/db/pool.js';
import {
    api,
    bearer,
    createUserAndToken,
    resetDatabase,
    closeDatabase,
    PASSWORD,
} from './helpers.js';

describe('authentication', () => {
    before(resetDatabase);
    after(closeDatabase);

    describe('POST /api/auth/register', () => {
        it('creates an account, lowercases the email, and never returns the hash', async () => {
      const res = await api
        .post('/api/auth/register')
        .send({ email: 'Racc@Example.com', password: PASSWORD });

        assert.equal(res.status, 201);
        assert.equal(res.body.user.email, 'racc@example.com');
        assert.ok(res.body.user.id);
        assert.doesNotMatch(JSON.stringify(res.body), /hash|password/i);
    });

    it('stores a bcrypt hash, not the password', async () => {
        await api
            .post('/api/auth/register')
            .send({ email: 'stored@example.com', password: PASSWORD});

        const { rows } = await pool.query(
            'SELECT password_hash FROM users WHERE email = $1',
            ['stored@example.com']
        );

        assert.notEqual(rows[0].password_hash, PASSWORD);
        assert.match(rows[0].password_hash, /^\$2[aby]\$04\$/);
    });

    it('rejects a duplicate email, ignoring case, with 409', async () => {
        await api 
            .post('/api/auth/register')
            .send({ email: 'dupe@example.com', password: PASSWORD });

        const res = await api
            .post('/api/auth/register')
            .send({ email: 'DUPE@example.com', password: PASSWORD });
        
        assert.equal(res.status, 409);
    });

    const invalidBodies = [
      ['a missing body', undefined],
      ['a missing password', { email: 'x@example.com' }],
      ['a non-string email', { email: 5, password: PASSWORD }],
      ['an invalid email', { email: 'not-an-email', password: PASSWORD }],
      ['a password shorter than 8 characters', { email: 'x@example.com', password: 'short' }],
      ['a password longer than 72 bytes', { email: 'x@example.com', password: 'a'.repeat(73) }],
    ];

    for (const [name, body] of invalidBodies) {
      it(`rejects ${name} with 400`, async () => {
        const request = api.post('/api/auth/register');
        const res = await (body === undefined ? request : request.send(body));

        assert.equal(res.status, 400);
      });
    }
  });

  describe('POST /api/auth/login', () => {
    before(async () => {
      await api
        .post('/api/auth/register')
        .send({ email: 'login@example.com', password: PASSWORD });
    });

    it('returns a token and the user for correct credentials', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: PASSWORD });

      assert.equal(res.status, 200);
      assert.equal(typeof res.body.token, 'string');
      assert.equal(res.body.user.email, 'login@example.com');
    });

    it('accepts the email in any case', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({ email: 'LOGIN@Example.com', password: PASSWORD });

      assert.equal(res.status, 200);
    });

    it('issues a token that carries only the user id and timing claims', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: PASSWORD });

      const payload = jwt.decode(res.body.token);

      assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
      assert.equal(payload.sub, String(res.body.user.id));
      assert.equal(payload.exp - payload.iat, 3600);
    });

    it('rejects a wrong password with 401', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'wrong password here' });

      assert.equal(res.status, 401);
    });

    it('gives an identical 401 for an unknown email and a wrong password', async () => {
      const wrongPassword = await api
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'wrong password here' });
      const unknownEmail = await api
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong password here' });

      assert.equal(wrongPassword.status, 401);
      assert.equal(unknownEmail.status, 401);
      assert.deepEqual(wrongPassword.body, unknownEmail.body);
    });

    it('rejects a missing field with 400', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({ email: 'login@example.com' });

      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/auth/me', () => {
    let session;

    before(async () => {
      session = await createUserAndToken('me@example.com');
    });

    it('returns the current user for a valid token', async () => {
      const res = await api.get('/api/auth/me').set(bearer(session.token));

      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, 'me@example.com');
    });

    it('rejects a missing token with 401', async () => {
      const res = await api.get('/api/auth/me');

      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Authentication required');
    });

    it('rejects an Authorization header that is not a Bearer token', async () => {
      const res = await api
        .get('/api/auth/me')
        .set('Authorization', `Basic ${session.token}`);

      assert.equal(res.status, 401);
    });

    it('rejects a garbage token with 401', async () => {
      const res = await api.get('/api/auth/me').set(bearer('abc.def.ghi'));

      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Invalid or expired token');
    });

    it('rejects a token whose signature was tampered with', async () => {
      const [header, payload, signature] = session.token.split('.');
      const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
      const tampered = [header, payload, flipped].join('.');

      const res = await api.get('/api/auth/me').set(bearer(tampered));

      assert.equal(res.status, 401);
    });

    it('rejects an expired token', async () => {
      const expired = jwt.sign({}, process.env.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: -10,
        subject: String(session.user.id),
      });

      const res = await api.get('/api/auth/me').set(bearer(expired));

      assert.equal(res.status, 401);
    });

    it('rejects a token signed with a different secret', async () => {
      const forged = jwt.sign({}, 'a-completely-different-secret-value-123', {
        algorithm: 'HS256',
        expiresIn: '1h',
        subject: String(session.user.id),
      });

      const res = await api.get('/api/auth/me').set(bearer(forged));

      assert.equal(res.status, 401);
    });

    it('rejects an unsigned token', async () => {
      const unsigned = jwt.sign({}, null, {
        algorithm: 'none',
        subject: String(session.user.id),
      });

      const res = await api.get('/api/auth/me').set(bearer(unsigned));

      assert.equal(res.status, 401);
    });

    it('rejects a valid token for a user that no longer exists', async () => {
      const ghost = await createUserAndToken('ghost@example.com');
      await pool.query('DELETE FROM users WHERE id = $1', [ghost.user.id]);

      const res = await api.get('/api/auth/me').set(bearer(ghost.token));

      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Account no longer exists');
    });
  });
});