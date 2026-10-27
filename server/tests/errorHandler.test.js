import { describe, it, mock } from 'node:test';
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

function fakeRequest() {
  return {
    method: 'GET',
    originalUrl: '/api/example',
    log: { error: mock.fn() },
  };
}

describe('errorHandler (unit)', () => {
  it('hides the details of an unexpected error from the client but logs them', () => {
    const req = fakeRequest();
    const res = fakeResponse();
    const err = new Error('connection to 10.0.0.5:5432 refused');

    errorHandler(err, req, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Something went wrong' });
    assert.equal(req.log.error.mock.callCount(), 1);
    assert.equal(req.log.error.mock.calls[0].arguments[0].err, err);
  });

  it('exposes the message of a client error (status below 500) without logging it as an error', () => {
    const req = fakeRequest();
    const res = fakeResponse();
    const err = Object.assign(new Error('Malformed JSON'), { status: 400 });

    errorHandler(err, req, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Malformed JSON' });
    assert.equal(req.log.error.mock.callCount(), 0);
  });

  it('hides the message of an error that carries a 5xx status', () => {
    const req = fakeRequest();
    const res = fakeResponse();
    const err = Object.assign(new Error('upstream exploded'), { status: 503 });

    errorHandler(err, req, res, () => {});

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'Something went wrong' });
  });

  it('hands the error back to Express if the response has already started', () => {
    const req = fakeRequest();
    const res = fakeResponse({ headersSent: true });
    const err = new Error('too late');
    let received = null;

    errorHandler(err, req, res, (passedOn) => {
      received = passedOn;
    });

    assert.equal(received, err);
    assert.equal(res.statusCode, null);
  });
});