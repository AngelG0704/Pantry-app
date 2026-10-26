const KEY = 'pantry.token';

export function loadToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveToken(token) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Storage can be unavailable (private mode, blocked); the session just won't persist.
    }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}