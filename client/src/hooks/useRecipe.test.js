import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRecipe } from './useRecipe.js';
import { getRecipe } from '../api.js';

vi.mock('../api.js', () => ({ getRecipe: vi.fn() }));

// The shape GET /api/recipes/:id returns (pinned by catalog.test.js on the server).
const TOAST = {
  id: 7,
  title: 'Buttered toast',
  instructions: 'Toast it.',
  prepMinutes: 5,
  ingredients: ['bread', 'butter'],
};
const OMELETTE = { ...TOAST, id: 8, title: 'Omelette' };

function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useRecipe: loading a recipe', () => {
  it('starts in the loading state', () => {
    getRecipe.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useRecipe('7'));

    expect(result.current).toMatchObject({
      status: 'loading',
      data: null,
      error: '',
      missing: false,
    });
  });

  it('loads the recipe, passing the id and an abort signal', async () => {
    getRecipe.mockResolvedValue(TOAST);

    const { result } = renderHook(() => useRecipe('7'));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(TOAST);
    expect(result.current.missing).toBe(false);
    expect(getRecipe).toHaveBeenCalledWith('7', expect.any(AbortSignal));
  });

  it('loads the new recipe when the id changes', async () => {
    getRecipe.mockResolvedValueOnce(TOAST).mockResolvedValueOnce(OMELETTE);
    const { result, rerender } = renderHook(({ id }) => useRecipe(id), {
      initialProps: { id: '7' },
    });
    await waitFor(() => expect(result.current.data).toEqual(TOAST));

    rerender({ id: '8' });

    await waitFor(() => expect(result.current.data).toEqual(OMELETTE));
    expect(getRecipe).toHaveBeenLastCalledWith('8', expect.any(AbortSignal));
  });
});

describe('useRecipe: failures', () => {
  for (const status of [404, 400]) {
    it(`marks the recipe as missing for a ${status}`, async () => {
      getRecipe.mockRejectedValue(apiError('Recipe not found', status));

      const { result } = renderHook(() => useRecipe('999'));

      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current.missing).toBe(true);
      expect(result.current.error).toBe('Recipe not found');
      expect(result.current.data).toBeNull();
    });
  }

  it('does not mark the recipe as missing for a server error', async () => {
    getRecipe.mockRejectedValue(apiError('Something went wrong.', 500));

    const { result } = renderHook(() => useRecipe('7'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.missing).toBe(false);
    expect(result.current.error).toBe('Something went wrong.');
  });

  it('does not mark the recipe as missing for a network failure (no status)', async () => {
    getRecipe.mockRejectedValue(new Error('Could not reach the server.'));

    const { result } = renderHook(() => useRecipe('7'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.missing).toBe(false);
  });

  it('retry goes back to loading at once, then loads again', async () => {
    getRecipe
      .mockRejectedValueOnce(apiError('Something went wrong.', 500))
      .mockResolvedValueOnce(TOAST);
    const { result } = renderHook(() => useRecipe('7'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => {
      result.current.retry();
    });
    expect(result.current).toMatchObject({ status: 'loading', error: '', missing: false });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(TOAST);
    expect(getRecipe).toHaveBeenCalledTimes(2);
  });
});

describe('useRecipe: cancelling', () => {
  it('aborts the request when the component goes away', () => {
    getRecipe.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useRecipe('7'));
    const signal = getRecipe.mock.calls[0][1];
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it('aborts the old request when the id changes', () => {
    getRecipe.mockReturnValue(new Promise(() => {}));
    const { rerender } = renderHook(({ id }) => useRecipe(id), { initialProps: { id: '7' } });
    const firstSignal = getRecipe.mock.calls[0][1];

    rerender({ id: '8' });

    expect(firstSignal.aborted).toBe(true);
  });

  it('treats an aborted request as "ignore", not as an error', async () => {
    getRecipe.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const { result } = renderHook(() => useRecipe('7'));
    await act(async () => {});

    expect(result.current.status).toBe('loading');
    expect(result.current.missing).toBe(false);
  });
});