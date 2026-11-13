import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePantry } from './usePantry.js';
import {
  addToPantry,
  getPantry,
  removeFromPantry,
  setPantryExpiry,
  updatePantryItem,
} from '../api.js';

vi.mock('../api.js', () => ({
  getPantry: vi.fn(),
  addToPantry: vi.fn(),
  removeFromPantry: vi.fn(),
  setPantryExpiry: vi.fn(),
  updatePantryItem: vi.fn(),
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

describe('usePantry: expiry dates', () => {
  const DATED_EGG = { ...EGG, expiresOn: '2026-11-10' };
  const UNDATED_BUTTER = { ...BUTTER, expiresOn: null };

  // Start a save and return WITHOUT waiting for it (same trick as startToggle).
  async function startSetExpiry(result, id, value) {
    let promise;
    await act(async () => {
      promise = result.current.setExpiry(id, value);
    });
    return { finished: promise };
  }

  async function setExpiryAndWait(result, id, value) {
    let saved;
    await act(async () => {
      saved = await result.current.setExpiry(id, value);
    });
    return saved;
  }

  it('fills the dates from the server when the pantry loads', async () => {
    const { result } = await renderLoaded([DATED_EGG, UNDATED_BUTTER]);

    expect(result.current.expiry).toEqual({ 1: '2026-11-10', 2: null });
  });

  it('waits for the server, then keeps the date it returned; the version does not change', async () => {
    const request = deferred();
    setPantryExpiry.mockReturnValue(request.promise);
    const { result } = await renderLoaded([UNDATED_BUTTER, EGG]);

    const started = await startSetExpiry(result, 1, '2026-11-10');

    // Not optimistic: nothing changes until the server answers.
    expect(result.current.expiry[1]).toBe(null);
    expect(result.current.pendingIds).toEqual([1]);
    expect(setPantryExpiry).toHaveBeenCalledWith('tok', 1, '2026-11-10');

    let saved;
    await act(async () => {
      request.resolve({ id: 1, name: 'egg', expiresOn: '2026-11-10' });
      saved = await started.finished;
    });

    expect(saved).toBe(true);
    expect(result.current.expiry[1]).toBe('2026-11-10');
    expect(result.current.pendingIds).toEqual([]);
    expect(result.current.version).toBe(0);
  });

  it('clears a date with null', async () => {
    setPantryExpiry.mockResolvedValue({ id: 1, name: 'egg', expiresOn: null });
    const { result } = await renderLoaded([DATED_EGG]);

    await setExpiryAndWait(result, 1, null);

    expect(setPantryExpiry).toHaveBeenCalledWith('tok', 1, null);
    expect(result.current.expiry[1]).toBe(null);
  });

  it('keeps the old date and shows the error when saving fails', async () => {
    setPantryExpiry.mockRejectedValue(
      apiError('expiresOn must be a date in YYYY-MM-DD form, or null', 400)
    );
    const { result } = await renderLoaded([DATED_EGG]);

    const saved = await setExpiryAndWait(result, 1, '2026-12-01');

    expect(saved).toBe(false);
    expect(result.current.expiry[1]).toBe('2026-11-10');
    expect(result.current.actionError).toBe(
      'expiresOn must be a date in YYYY-MM-DD form, or null'
    );
    expect(result.current.pendingIds).toEqual([]);
  });

  it('does not save a date while that item is being removed, and vice versa', async () => {
    const removal = deferred();
    removeFromPantry.mockReturnValue(removal.promise);
    const { result } = await renderLoaded([DATED_EGG]);

    const started = await startToggle(result, 1);
    const saved = await setExpiryAndWait(result, 1, '2026-12-01');

    expect(saved).toBe(false);
    expect(setPantryExpiry).not.toHaveBeenCalled();

    await act(async () => {
      removal.resolve(null);
      await started.finished;
    });
  });

  it('forgets the date when the item is removed, so re-adding starts with none', async () => {
    removeFromPantry.mockResolvedValue(null);
    addToPantry.mockResolvedValue({ id: 1, name: 'egg' });
    const { result } = await renderLoaded([DATED_EGG]);

    await toggleAndWait(result, 1);
    expect(result.current.expiry).not.toHaveProperty('1');

    await toggleAndWait(result, 1);
    expect(result.current.ids).toEqual([1]);
    expect(result.current.expiry[1] ?? null).toBe(null);
  });

  it('keeps the date when a removal fails and is rolled back', async () => {
    removeFromPantry.mockRejectedValue(apiError('Something went wrong', 500));
    const { result } = await renderLoaded([DATED_EGG]);

    await toggleAndWait(result, 1);

    expect(result.current.ids).toEqual([1]);
    expect(result.current.expiry[1]).toBe('2026-11-10');
  });
});
});

describe('usePantry: item details (amounts)', () => {
  const FULL_EGG = {
    ...EGG,
    expiresOn: '2026-11-10',
    quantity: 6,
    unit: 'piece',
    addedAt: '2026-11-01T12:00:00.000Z',
  };

  async function updateAndWait(result, id, changes) {
    let saved;
    await act(async () => {
      saved = await result.current.updateItem(id, changes);
    });
    return saved;
  }

  it('fills every detail from the server, with missing fields as null', async () => {
    const { result } = await renderLoaded([FULL_EGG, BUTTER]);

    expect(result.current.details).toEqual({
      1: { expiresOn: '2026-11-10', quantity: 6, unit: 'piece', addedAt: '2026-11-01T12:00:00.000Z' },
      2: { expiresOn: null, quantity: null, unit: null, addedAt: null },
    });
  });

  it('sends only the given fields, waits, then keeps the whole item the server returned', async () => {
    const request = deferred();
    updatePantryItem.mockReturnValue(request.promise);
    const { result } = await renderLoaded([{ ...EGG, expiresOn: '2026-11-10' }]);

    let finished;
    await act(async () => {
      finished = result.current.updateItem(1, { quantity: 1.5, unit: 'cup' });
    });

    expect(updatePantryItem).toHaveBeenCalledWith('tok', 1, { quantity: 1.5, unit: 'cup' });
    expect(result.current.pendingIds).toEqual([1]);
    expect(result.current.details[1].quantity).toBe(null);

    let saved;
    await act(async () => {
      request.resolve({
        id: 1,
        name: 'egg',
        expiresOn: '2026-11-10',
        quantity: 1.5,
        unit: 'cup',
        addedAt: '2026-11-01T12:00:00.000Z',
      });
      saved = await finished;
    });

    expect(saved).toBe(true);
    expect(result.current.details[1]).toEqual({
      expiresOn: '2026-11-10',
      quantity: 1.5,
      unit: 'cup',
      addedAt: '2026-11-01T12:00:00.000Z',
    });
    expect(result.current.pendingIds).toEqual([]);
    expect(result.current.version).toBe(0);
  });

  it('clears the amount and keeps the date, as the server reports', async () => {
    updatePantryItem.mockResolvedValue({
      id: 1,
      name: 'egg',
      expiresOn: '2026-11-10',
      quantity: null,
      unit: null,
      addedAt: '2026-11-01T12:00:00.000Z',
    });
    const { result } = await renderLoaded([FULL_EGG]);

    await updateAndWait(result, 1, { quantity: null, unit: null });

    expect(result.current.details[1]).toEqual({
      expiresOn: '2026-11-10',
      quantity: null,
      unit: null,
      addedAt: '2026-11-01T12:00:00.000Z',
    });
    expect(result.current.expiry[1]).toBe('2026-11-10');
  });

  it('keeps the old details and shows the error when saving fails', async () => {
    updatePantryItem.mockRejectedValue(
      apiError('quantity must be a positive number with at most 3 decimal places, or null', 400)
    );
    const { result } = await renderLoaded([FULL_EGG]);

    const saved = await updateAndWait(result, 1, { quantity: 2, unit: 'cup' });

    expect(saved).toBe(false);
    expect(result.current.details[1]).toEqual({
      expiresOn: '2026-11-10',
      quantity: 6,
      unit: 'piece',
      addedAt: '2026-11-01T12:00:00.000Z',
    });
    expect(result.current.actionError).toBe(
      'quantity must be a positive number with at most 3 decimal places, or null'
    );
  });

  it('does not save an amount while that item is being removed', async () => {
    const removal = deferred();
    removeFromPantry.mockReturnValue(removal.promise);
    const { result } = await renderLoaded([FULL_EGG]);

    const started = await startToggle(result, 1);
    const saved = await updateAndWait(result, 1, { quantity: 2, unit: 'cup' });

    expect(saved).toBe(false);
    expect(updatePantryItem).not.toHaveBeenCalled();

    await act(async () => {
      removal.resolve(null);
      await started.finished;
    });
  });

  it('forgets the amount when the item is removed', async () => {
    removeFromPantry.mockResolvedValue(null);
    const { result } = await renderLoaded([FULL_EGG]);

    await toggleAndWait(result, 1);

    expect(result.current.details).not.toHaveProperty('1');
  });

  it('keeps the amount when a date is saved (the server returns both)', async () => {
    setPantryExpiry.mockResolvedValue({
      id: 1,
      name: 'egg',
      expiresOn: '2026-12-01',
      quantity: 6,
      unit: 'piece',
      addedAt: '2026-11-01T12:00:00.000Z',
    });
    const { result } = await renderLoaded([FULL_EGG]);

    await act(async () => {
      await result.current.setExpiry(1, '2026-12-01');
    });

    expect(result.current.details[1]).toEqual({
      expiresOn: '2026-12-01',
      quantity: 6,
      unit: 'piece',
      addedAt: '2026-11-01T12:00:00.000Z',
    });
  });
});

describe('usePantry: addedAt from adding', () => {
  const NEW_EGG = {
    ...EGG,
    expiresOn: null,
    quantity: null,
    unit: null,
    addedAt: '2026-11-12T10:00:00.000Z',
  };

  it('keeps the whole item the server returns after an add, so a new item has its addedAt', async () => {
    addToPantry.mockResolvedValue(NEW_EGG);
    const { result } = await renderLoaded([]);

    await toggleAndWait(result, 1);

    expect(result.current.details[1]).toEqual({
      expiresOn: null,
      quantity: null,
      unit: null,
      addedAt: '2026-11-12T10:00:00.000Z',
    });
  });

  it('takes the new addedAt when an item is removed and added again', async () => {
    removeFromPantry.mockResolvedValue(null);
    addToPantry.mockResolvedValue(NEW_EGG);
    const { result } = await renderLoaded([
      { ...EGG, expiresOn: '2026-11-10', quantity: 6, unit: 'piece', addedAt: '2026-11-01T12:00:00.000Z' },
    ]);

    await toggleAndWait(result, 1);
    await toggleAndWait(result, 1);

    expect(result.current.details[1].addedAt).toBe('2026-11-12T10:00:00.000Z');
    expect(result.current.details[1].expiresOn).toBe(null);
  });

  it('creates no details when an add fails', async () => {
    addToPantry.mockRejectedValue(apiError('Unknown ingredient', 400));
    const { result } = await renderLoaded([]);

    await toggleAndWait(result, 1);

    expect(result.current.details).not.toHaveProperty('1');
  });
});