import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  getIngredients,
  getMyMatches,
  getRecipe,
  loginUser,
  matchRecipes,
  removeFromPantry,
  addToPantry,
  getCurrentUser,
  setUnauthorizedHandler,
} from './api.js';

const API = 'http://api.test';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

// What the code sent on its first (or nth) fetch call.
function sent(index = 0) {
  const [url, options] = fetchMock.mock.calls[index];
  return { url, options };
}

describe('request basics', () => {
  it('sends a plain GET to the API address, with no Authorization header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'egg' }]));

    const data = await getIngredients();

    expect(data).toEqual([{ id: 1, name: 'egg' }]);
    const { url, options } = sent();
    expect(url).toBe(`${API}/api/ingredients`);
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('sends the token as a Bearer header when one is given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 1 } }));

    await getCurrentUser('my-token');

    expect(sent().options.headers.Authorization).toBe('Bearer my-token');
  });

  it('sends a JSON body with a Content-Type header on POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 3, name: 'egg' }, 201));

    await addToPantry('my-token', 3);

    const { url, options } = sent();
    expect(url).toBe(`${API}/api/pantry`);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ ingredientId: 3 });
  });

  it('returns null for a 204 response instead of trying to read a body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await removeFromPantry('my-token', 3);

    expect(result).toBeNull();
  });
});

describe('failures become ApiError', () => {
  it('carries the status, the server message, and the details', async () => {
    const details = [{ field: 'email', message: 'A valid email is required' }];
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'A valid email is required', details }, 400)
    );

    const attempt = loginUser('nope', 'x');

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({
      status: 400,
      message: 'A valid email is required',
      details,
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));

    await expect(getIngredients()).rejects.toMatchObject({
      status: 502,
      message: 'Something went wrong.',
    });
  });

  it('turns a network failure into a friendly ApiError with no status', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const attempt = getIngredients();

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({
      message: 'Could not reach the server. Check your connection and try again.',
      status: undefined,
    });
  });

  it('lets an abort through unchanged so callers can ignore it', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValueOnce(abort);

    await expect(getIngredients()).rejects.toBe(abort);
  });
});

describe('the unauthorized handler', () => {
  it('runs when a request that carried a token gets a 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token' }, 401));

    await expect(getCurrentUser('old-token')).rejects.toMatchObject({ status: 401 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT run for a 401 on a request with no token (a failed login)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid email or password' }, 401));

    await expect(loginUser('a@example.com', 'wrong')).rejects.toMatchObject({ status: 401 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does NOT run for other errors on an authenticated request', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Something went wrong' }, 500));

    await expect(getCurrentUser('good-token')).rejects.toMatchObject({ status: 500 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('still throws the 401 when no handler is registered', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token' }, 401));

    await expect(getCurrentUser('old-token')).rejects.toMatchObject({ status: 401 });
  });
});

describe('request URLs', () => {
  it('sends match ids as one comma-separated parameter and omits an empty maxMissing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await matchRecipes([1, 2, 3]);

    const url = new URL(sent().url);
    expect(url.pathname).toBe('/api/recipes/match');
    expect(url.searchParams.get('ingredients')).toBe('1,2,3');
    expect(url.searchParams.has('maxMissing')).toBe(false);
  });

  it('includes maxMissing when it is "0" (zero is a real choice, not "empty")', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await matchRecipes([1], { maxMissing: '0' });

    expect(new URL(sent().url).searchParams.get('maxMissing')).toBe('0');
  });

  it('encodes a recipe id before placing it in the path', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await getRecipe('a/b?c');

    expect(sent().url).toBe(`${API}/api/recipes/a%2Fb%3Fc`);
  });

  it('removes a pantry item with DELETE on its own path', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await removeFromPantry('my-token', 7);

    const { url, options } = sent();
    expect(url).toBe(`${API}/api/pantry/7`);
    expect(options.method).toBe('DELETE');
  });

  it('adds no query string to pantry matches when maxMissing is empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await getMyMatches('my-token');

    expect(sent().url).toBe(`${API}/api/pantry/matches`);
  });

  it('adds maxMissing to pantry matches when it is chosen', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await getMyMatches('my-token', { maxMissing: '2' });

    expect(sent().url).toBe(`${API}/api/pantry/matches?maxMissing=2`);
  });
});