const API_URL = import.meta.env.VITE_API_URL;

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal, token } = {}) {
  const headers = {};

  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.'
    );
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(data?.error ?? 'Something went wrong.', {
      status: response.status,
      details: data?.details,
    });
  }

  return data;
}

export function getIngredients(signal) {
  return request('/api/ingredients', { signal });
}

export function matchRecipes(ingredientIds, { maxMissing = '', signal } = {}) {
  const params = new URLSearchParams({ ingredients: ingredientIds.join(',') });

  if (maxMissing !== '') {
    params.set('maxMissing', String(maxMissing));
  }

  return request(`/api/recipes/match?${params}`, { signal });
}

export function getRecipe(id, signal) {
  return request(`/api/recipes/${encodeURIComponent(id)}`, { signal });
}

export function registerUser(email, password) {
  return request('/api/auth/register', {
    method: 'POST',
    body: { email, password },
  });
}

export function loginUser(email, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function getCurrentUser(token, signal) {
  return request('/api/auth/me', { token, signal });
}

export function getPantry(token, signal) {
  return request('/api/pantry', {token, signal});
} 

export function addToPantry(token, ingredientId) {
  return request('/api/pantry', {
    method: 'POST',
    body: { ingredientId },
    token,
  });
}

export function removeFromPantry(token, ingredientId) {
  return request(`/api/pantry/${encodeURIComponent(ingredientId)}`, {
    method: 'DELETE',
    token,
  });
}

export function getMyMatches(token, { maxMissing = '', signal } = {}) {
  const params = new URLSearchParams();

  if (maxMissing !== ''){
    params.set('maxMissing', String(maxMissing));
  }

  const query = params.toString();
  return request(`/api/pantry/matches${query ? `?${query}` : ''}`,{
    token,
    signal,
  });
}