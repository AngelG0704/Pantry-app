import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMyMatches } from './useMyMatches.js';
import { getMyMatches } from '../api.js';

vi.mock('../api.js', () => ({ getMyMatches: vi.fn() }));

const TOAST = { id: 7, title: 'Buttered toast', matchedCount: 2, totalCount: 3 };
const OMELETTE = { id: 8, title: 'Omelette', matchedCount: 3, totalCount: 3 };

function apiError(message) {
  return Object.assign(new Error(message), { status: 500 });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderMatches(initial = { token: 'tok', version: 0, maxMissing: '' }) {
  return renderHook(({ token, version, maxMissing }) => useMyMatches(token, version, maxMissing), {
    initialProps: initial,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useMyMatches: loading', () => {
  it('starts in the loading state', () => {
    getMyMatches.mockReturnValue(new Promise(() => {}));

    const { result } = renderMatches();

    expect(result.current).toEqual({ status: 'loading', data: [], error: '' });
  });

  it('asks for this user\'s matches with the token, the limit, and a signal', async () => {
    getMyMatches.mockResolvedValue([TOAST]);

    const { result } = renderMatches({ token: 'tok', version: 0, maxMissing: '2' });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual([TOAST]);
    expect(getMyMatches).toHaveBeenCalledWith('tok', {
      maxMissing: '2',
      signal: expect.any(AbortSignal),
    });
  });

  it('reports the error message when the first load fails', async () => {
    getMyMatches.mockRejectedValue(apiError('Something went wrong.'));

    const { result } = renderMatches();

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Something went wrong.');
    expect(result.current.data).toEqual([]);
  });
});

describe('useMyMatches: refreshing', () => {
  it('asks again when the pantry version changes', async () => {
    getMyMatches.mockResolvedValue([TOAST]);
    const { result, rerender } = renderMatches();
    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({ token: 'tok', version: 1, maxMissing: '' });

    await waitFor(() => expect(getMyMatches).toHaveBeenCalledTimes(2));
  });

  it('asks again when the limit changes', async () => {
    getMyMatches.mockResolvedValue([TOAST]);
    const { result, rerender } = renderMatches();
    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({ token: 'tok', version: 0, maxMissing: '0' });

    await waitFor(() =>
      expect(getMyMatches).toHaveBeenLastCalledWith('tok', {
        maxMissing: '0',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('does not ask again for a re-render with the same inputs', async () => {
    getMyMatches.mockResolvedValue([TOAST]);
    const { result, rerender } = renderMatches();
    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({ token: 'tok', version: 0, maxMissing: '' });
    await act(async () => {});

    expect(getMyMatches).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the old recipes, with no loading flash, while refreshing', async () => {
    const refresh = deferred();
    getMyMatches.mockResolvedValueOnce([TOAST]).mockReturnValueOnce(refresh.promise);
    const { result, rerender } = renderMatches();
    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({ token: 'tok', version: 1, maxMissing: '' });

    expect(result.current.status).toBe('success');
    expect(result.current.data).toEqual([TOAST]);

    await act(async () => {
      refresh.resolve([OMELETTE]);
    });

    expect(result.current.data).toEqual([OMELETTE]);
  });

  it('keeps the old recipes next to the error when a refresh fails', async () => {
    getMyMatches
      .mockResolvedValueOnce([TOAST])
      .mockRejectedValueOnce(apiError('Something went wrong.'));
    const { result, rerender } = renderMatches();
    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({ token: 'tok', version: 1, maxMissing: '' });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Something went wrong.');
    expect(result.current.data).toEqual([TOAST]);
  });
});

describe('useMyMatches: cancelling', () => {
  it('aborts the previous request when the inputs change', async () => {
    getMyMatches.mockReturnValue(new Promise(() => {}));
    const { rerender } = renderMatches();
    const firstSignal = getMyMatches.mock.calls[0][1].signal;
    expect(firstSignal.aborted).toBe(false);

    rerender({ token: 'tok', version: 1, maxMissing: '' });

    expect(firstSignal.aborted).toBe(true);
  });

  it('aborts the request when the component goes away', () => {
    getMyMatches.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderMatches();
    const signal = getMyMatches.mock.calls[0][1].signal;

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it('does not show an error for an aborted request', async () => {
    getMyMatches.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const { result } = renderMatches();
    await act(async () => {});

    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBe('');
  });
});