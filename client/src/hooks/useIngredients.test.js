import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useIngredients } from './useIngredients.js';
import { getIngredients } from '../api.js';

vi.mock('../api.js', () => ({ getIngredients: vi.fn() }));

const CATALOG = [
  { id: 1, name: 'egg' },
  { id: 2, name: 'butter' },
];

function apiError(message) {
  return Object.assign(new Error(message), { status: 500 });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useIngredients', () => {
  it('starts in the loading state with an empty list', () => {
    getIngredients.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useIngredients());

    expect(result.current).toMatchObject({ status: 'loading', data: [], error: '' });
  });

  it('loads the catalog, passing an abort signal to the request', async () => {
    getIngredients.mockResolvedValue(CATALOG);

    const { result } = renderHook(() => useIngredients());

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(CATALOG);
    expect(result.current.error).toBe('');
    expect(getIngredients).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('reports the error message and an empty list when loading fails', async () => {
    getIngredients.mockRejectedValue(apiError('Could not reach the server.'));

    const { result } = renderHook(() => useIngredients());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Could not reach the server.');
    expect(result.current.data).toEqual([]);
  });

  it('retry goes back to loading at once, then loads again', async () => {
    getIngredients
      .mockRejectedValueOnce(apiError('Could not reach the server.'))
      .mockResolvedValueOnce(CATALOG);
    const { result } = renderHook(() => useIngredients());
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => {
      result.current.retry();
    });
    expect(result.current).toMatchObject({ status: 'loading', error: '' });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(CATALOG);
    expect(getIngredients).toHaveBeenCalledTimes(2);
  });

  it('aborts the request when the component goes away', () => {
    getIngredients.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useIngredients());
    const signal = getIngredients.mock.calls[0][0];
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it('treats an aborted request as "ignore", not as an error', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    getIngredients.mockRejectedValue(abort);

    const { result } = renderHook(() => useIngredients());
    await act(async () => {});

    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBe('');
  });
});