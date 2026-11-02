import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearToken, loadToken, saveToken } from './tokenStorage.js';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function breakStorage(method) {
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error('Storage is blocked');
  });
}

describe('tokenStorage', () => {
  it('saves a token under pantry.token and loads it back', () => {
    saveToken('abc');

    expect(localStorage.getItem('pantry.token')).toBe('abc');
    expect(loadToken()).toBe('abc');
  });

  it('returns null when nothing is stored', () => {
    expect(loadToken()).toBeNull();
  });

  it('clears the stored token', () => {
    saveToken('abc');

    clearToken();

    expect(loadToken()).toBeNull();
    expect(localStorage.getItem('pantry.token')).toBeNull();
  });

  it('returns null instead of throwing when storage cannot be read', () => {
    breakStorage('getItem');

    expect(loadToken()).toBeNull();
  });

  it('does not throw when storage cannot be written or cleared', () => {
    breakStorage('setItem');
    breakStorage('removeItem');

    expect(() => saveToken('abc')).not.toThrow();
    expect(() => clearToken()).not.toThrow();
  });
});