import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePantryNames } from './usePantryNames.js';
import { getPantry } from '../api.js';

vi.mock('../api.js', () => ({ getPantry: vi.fn() }));

const EGG = { id: 1, name: 'egg' };
const BUTTER = { id: 2, name: 'butter' };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('usePantryNames', () => {
  it('returns null and asks the server nothing when nobody is logged in', async () => {
    const { result } = renderHook(() => usePantryNames(null));
    await act(async () => {});

    expect(result.current).toBeNull();
    expect(getPantry).not.toHaveBeenCalled();
  });

  it('returns null while the pantry is loading', () => {
    getPantry.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePantryNames('tok'));

    expect(result.current).toBeNull();
    expect(getPantry).toHaveBeenCalledWith('tok', expect.any(AbortSignal));
  });

  it('returns a Set of ingredient names once loaded', async () => {
    getPantry.mockResolvedValue([EGG, BUTTER]);

    const { result } = renderHook(() => usePantryNames('tok'));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toBeInstanceOf(Set);
    expect([...result.current].sort()).toEqual(['butter', 'egg']);
  });

  it('returns an empty Set (not null) for a pantry that is empty', async () => {
    getPantry.mockResolvedValue([]);

    const { result } = renderHook(() => usePantryNames('tok'));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.size).toBe(0);
  });

  it('stays null, and raises no error, when the lookup fails', async () => {
    getPantry.mockRejectedValue(new Error('Could not reach the server.'));

    const { result } = renderHook(() => usePantryNames('tok'));
    await act(async () => {});

    expect(getPantry).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });

  it('never shows one user\'s names to the next token', async () => {
    const second = deferred();
    getPantry.mockResolvedValueOnce([EGG]).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ token }) => usePantryNames(token), {
      initialProps: { token: 'user-a' },
    });
    await waitFor(() => expect(result.current).not.toBeNull());

    rerender({ token: 'user-b' });

    expect(result.current).toBeNull();

    await act(async () => {
      second.resolve([BUTTER]);
    });

    expect([...result.current]).toEqual(['butter']);
  });

  it('returns to null when the user logs out', async () => {
    getPantry.mockResolvedValue([EGG]);
    const { result, rerender } = renderHook(({ token }) => usePantryNames(token), {
      initialProps: { token: 'tok' },
    });
    await waitFor(() => expect(result.current).not.toBeNull());

    rerender({ token: null });

    expect(result.current).toBeNull();
  });

  it('aborts the request when the component goes away', () => {
    getPantry.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => usePantryNames('tok'));
    const signal = getPantry.mock.calls[0][1];
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });
});