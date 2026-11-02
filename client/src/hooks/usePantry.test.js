import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePantry } from './usePantry.js';
import { addToPantry, getPantry, removeFromPantry } from '../api.js';

vi.mock('../api.js', () => ({
  getPantry: vi.fn(),
  addToPantry: vi.fn(),
  removeFromPantry: vi.fn(),
}));

const EGG = { id: 1, name: 'egg' };
const BUTTER = { id: 2, name: 'butter' };

function apiError(message, status) {
  return Object.assign(new Error(message), { status });
}

// A promise that you settle by hand, to freeze a request "in flight".
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderLoaded(items = []) {
  getPantry.mockResolvedValue(items);
  const hook = renderHook(() => usePantry('tok'));
  await waitFor(() => expect(hook.result.current.status).toBe('success'));
  return hook;
}

// Start a toggle and return WITHOUT waiting for it to finish.
// (The promise is wrapped in an object: returning a bare promise from an
// async function would make the caller wait for it.)
async function startToggle(result, id) {
  let promise;
  await act(async () => {
    promise = result.current.toggle(id);
  });
  return { finished: promise };
}

// Toggle and wait until the whole operation, including rollback, is done.
async function toggleAndWait(result, id) {
  await act(async () => {
    await result.current.toggle(id);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('usePantry: loading', () => {
  it('starts loading, then fills the ids from the server', async () => {
    getPantry.mockResolvedValue([BUTTER, EGG]);

    const { result } = renderHook(() => usePantry('tok'));

    expect(result.current.status).toBe('loading');
    expect(result.current.ids).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.ids).toEqual([2, 1]);
    expect(getPantry).toHaveBeenCalledWith('tok', expect.any(AbortSignal));
  });

  it('reports a load error, and retry loads again', async () => {
    getPantry
      .mockRejectedValueOnce(apiError('Could not reach the server.'))
      .mockResolvedValueOnce([EGG]);

    const { result } = renderHook(() => usePantry('tok'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Could not reach the server.');

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.ids).toEqual([1]);
    expect(getPantry).toHaveBeenCalledTimes(2);
  });

  it('aborts the load request when the page goes away', () => {
    getPantry.mockReturnValue(new Promise(() => {}));

    const { unmount } = renderHook(() => usePantry('tok'));
    const signal = getPantry.mock.calls[0][1];
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });
});

describe('usePantry: optimistic updates', () => {
  it('adds optimistically: the id appears and is pending before the server answers', async () => {
    const request = deferred();
    addToPantry.mockReturnValue(request.promise);
    const { result } = await renderLoaded([]);

    const started = await startToggle(result, 1);

    expect(result.current.ids).toEqual([1]);
    expect(result.current.pendingIds).toEqual([1]);
    expect(result.current.version).toBe(0);
    expect(addToPantry).toHaveBeenCalledWith('tok', 1);

    await act(async () => {
      request.resolve({ id: 1, name: 'egg' });
      await started.finished;
    });

    expect(result.current.ids).toEqual([1]);
    expect(result.current.pendingIds).toEqual([]);
    expect(result.current.version).toBe(1);
  });

  it('removes optimistically, then bumps the version when the server confirms', async () => {
    const request = deferred();
    removeFromPantry.mockReturnValue(request.promise);
    const { result } = await renderLoaded([EGG, BUTTER]);

    const started = await startToggle(result, 1);

    expect(result.current.ids).toEqual([2]);
    expect(result.current.pendingIds).toEqual([1]);
    expect(removeFromPantry).toHaveBeenCalledWith('tok', 1);

    await act(async () => {
      request.resolve(null);
      await started.finished;
    });

    expect(result.current.ids).toEqual([2]);
    expect(result.current.pendingIds).toEqual([]);
    expect(result.current.version).toBe(1);
  });
});

describe('usePantry: failures', () => {
  it('rolls back a failed add and shows the error', async () => {
    addToPantry.mockRejectedValue(apiError('Unknown ingredient', 400));
    const { result } = await renderLoaded([EGG]);

    await toggleAndWait(result, 2);

    expect(result.current.ids).toEqual([1]);
    expect(result.current.actionError).toBe('Unknown ingredient');
    expect(result.current.pendingIds).toEqual([]);
    expect(result.current.version).toBe(0);
  });

  it('rolls back a failed removal and shows the error', async () => {
    removeFromPantry.mockRejectedValue(apiError('Something went wrong', 500));
    const { result } = await renderLoaded([EGG, BUTTER]);

    await toggleAndWait(result, 1);

    // Rollback appends the id, so compare without caring about order.
    expect([...result.current.ids].sort()).toEqual([1, 2]);
    expect(result.current.actionError).toBe('Something went wrong');
    expect(result.current.pendingIds).toEqual([]);
    expect(result.current.version).toBe(0);
  });

  it('treats a 404 on removal as success: already gone, no error', async () => {
    removeFromPantry.mockRejectedValue(apiError('Ingredient not in pantry', 404));
    const { result } = await renderLoaded([EGG, BUTTER]);

    await toggleAndWait(result, 1);

    expect(result.current.ids).toEqual([2]);
    expect(result.current.actionError).toBe('');
    expect(result.current.version).toBe(1);
  });

  it('does NOT treat a 404 on add as success', async () => {
    addToPantry.mockRejectedValue(apiError('Not found', 404));
    const { result } = await renderLoaded([]);

    await toggleAndWait(result, 1);

    expect(result.current.ids).toEqual([]);
    expect(result.current.actionError).toBe('Not found');
    expect(result.current.version).toBe(0);
  });
});

describe('usePantry: requests in flight', () => {
  it('ignores a second toggle of the same ingredient while one is pending', async () => {
    const request = deferred();
    addToPantry.mockReturnValue(request.promise);
    const { result } = await renderLoaded([]);

    const first = await startToggle(result, 1);
    await startToggle(result, 1);

    expect(addToPantry).toHaveBeenCalledTimes(1);
    expect(removeFromPantry).not.toHaveBeenCalled();
    expect(result.current.ids).toEqual([1]);

    await act(async () => {
      request.resolve({});
      await first.finished;
    });
  });

  it('lets different ingredients be in flight at the same time', async () => {
    const a = deferred();
    const b = deferred();
    addToPantry.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { result } = await renderLoaded([]);

    const first = await startToggle(result, 1);
    const second = await startToggle(result, 2);

    expect(result.current.pendingIds).toEqual([1, 2]);

    await act(async () => {
      a.resolve({});
      await first.finished;
    });
    expect(result.current.pendingIds).toEqual([2]);

    await act(async () => {
      b.resolve({});
      await second.finished;
    });
    expect(result.current.pendingIds).toEqual([]);
    expect(result.current.ids).toEqual([1, 2]);
  });

  it('clears the previous error when the next toggle starts', async () => {
    addToPantry
      .mockRejectedValueOnce(apiError('Something went wrong', 500))
      .mockResolvedValueOnce({});
    const { result } = await renderLoaded([]);

    await toggleAndWait(result, 1);
    expect(result.current.actionError).toBe('Something went wrong');

    await toggleAndWait(result, 2);
    expect(result.current.actionError).toBe('');
    expect(result.current.ids).toEqual([2]);
  });
});