import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRecipeMatches } from './useRecipeMatches.js';
import { matchRecipes } from '../api.js';

vi.mock('../api.js', () => ({ matchRecipes: vi.fn() }));

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

// Start a search and return without waiting for it to finish.
async function startSearch(result, ids, maxMissing) {
  let promise;
  await act(async () => {
    promise = result.current.search(ids, maxMissing);
  });
  return { finished: promise };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useRecipeMatches', () => {
  it('is idle, and asks the server nothing, until a search is started', () => {
    const { result } = renderHook(() => useRecipeMatches());

    expect(result.current).toMatchObject({ status: 'idle', data: [], error: '' });
    expect(matchRecipes).not.toHaveBeenCalled();
  });

  it('shows loading while the search runs, then the recipes', async () => {
    const request = deferred();
    matchRecipes.mockReturnValue(request.promise);
    const { result } = renderHook(() => useRecipeMatches());

    const started = await startSearch(result, [1, 2], '1');

    expect(result.current.status).toBe('loading');
    expect(matchRecipes).toHaveBeenCalledWith([1, 2], {
      maxMissing: '1',
      signal: expect.any(AbortSignal),
    });

    await act(async () => {
      request.resolve([TOAST]);
      await started.finished;
    });

    expect(result.current).toMatchObject({ status: 'success', data: [TOAST], error: '' });
  });

  it('reports the error and drops old results when a search fails', async () => {
    matchRecipes
      .mockResolvedValueOnce([TOAST])
      .mockRejectedValueOnce(apiError('Something went wrong.'));
    const { result } = renderHook(() => useRecipeMatches());
    await act(async () => {
      await result.current.search([1], '');
    });
    expect(result.current.data).toEqual([TOAST]);

    await act(async () => {
      await result.current.search([1], '');
    });

    expect(result.current).toMatchObject({
      status: 'error',
      data: [],
      error: 'Something went wrong.',
    });
  });

  it('clears the previous results as soon as a new search starts', async () => {
    const second = deferred();
    matchRecipes.mockResolvedValueOnce([TOAST]).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useRecipeMatches());
    await act(async () => {
      await result.current.search([1], '');
    });

    const started = await startSearch(result, [2], '');

    expect(result.current).toMatchObject({ status: 'loading', data: [] });

    await act(async () => {
      second.resolve([OMELETTE]);
      await started.finished;
    });
  });

  it('aborts the previous search when a new one starts', async () => {
    const first = deferred();
    const second = deferred();
    matchRecipes.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useRecipeMatches());

    const one = await startSearch(result, [1], '');
    const firstSignal = matchRecipes.mock.calls[0][1].signal;
    expect(firstSignal.aborted).toBe(false);

    const two = await startSearch(result, [2], '');

    expect(firstSignal.aborted).toBe(true);
    expect(matchRecipes.mock.calls[1][1].signal.aborted).toBe(false);

    await act(async () => {
      first.reject(new DOMException('The operation was aborted.', 'AbortError'));
      second.resolve([OMELETTE]);
      await Promise.all([one.finished, two.finished]);
    });

    expect(result.current).toMatchObject({ status: 'success', data: [OMELETTE] });
  });

  it('does not show an error for a search that was aborted', async () => {
    const first = deferred();
    const second = deferred();
    matchRecipes.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useRecipeMatches());

    const one = await startSearch(result, [1], '');
    await startSearch(result, [2], '');
    await act(async () => {
      first.reject(new DOMException('The operation was aborted.', 'AbortError'));
      await one.finished;
    });

    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBe('');
  });

  it('aborts a running search when the component goes away', async () => {
    matchRecipes.mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderHook(() => useRecipeMatches());
    await startSearch(result, [1], '');
    const signal = matchRecipes.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it('can search again after an error', async () => {
    matchRecipes
      .mockRejectedValueOnce(apiError('Something went wrong.'))
      .mockResolvedValueOnce([TOAST]);
    const { result } = renderHook(() => useRecipeMatches());
    await act(async () => {
      await result.current.search([1], '');
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      await result.current.search([1], '');
    });

    expect(result.current).toMatchObject({ status: 'success', data: [TOAST], error: '' });
  });
});