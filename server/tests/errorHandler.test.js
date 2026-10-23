import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errorHandler.js';

function fakeResponse({ headersSent = false } = {}) {
  return {
    headersSent,
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const fakeRequest = { method: 'GET', originalUrl: '/api/example' };

describe('errorHandler (unit)', () => {
  beforeEach(() => {
    mock.method(console, 'error', () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('hides the details of an unexpected error from the client but logs them', () => {
    const res = fakeResponse();
    const err = new Error('connection to 10.0.0.5:5432 refused');

    errorHandler(err, fakeRequest, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Something went wrong' });
    assert.equal(console.error.mock.callCount(), 1);
  });

  it('exposes the message of a client error (status below 500)', () => {
    const res = fakeResponse();
    const err = Object.assign(new Error('Malformed JSON'), { status: 400 });

    errorHandler(err, fakeRequest, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Malformed JSON' });
  });

  it('hides the message of an error that carries a 5xx status', () => {
    const res = fakeResponse();
    const err = Object.assign(new Error('upstream exploded'), { status: 503 });

    errorHandler(err, fakeRequest, res, () => {});

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'Something went wrong' });
  });

  it('hands the error back to Express if the response has already started', () => {
    const res = fakeResponse({ headersSent: true });
    const err = new Error('too late');
    let received = null;

    errorHandler(err, fakeRequest, res, (passedOn) => {
      received = passedOn;
    });

    assert.equal(received, err);
    assert.equal(res.statusCode, null);
  });
});