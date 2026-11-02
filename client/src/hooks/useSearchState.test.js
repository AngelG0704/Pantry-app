import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSearchState } from './useSearchState.js';
import { getIngredients, matchRecipes } from '../api.js';

vi.mock('../api.js', () => ({ getIngredients: vi.fn(), matchRecipes: vi.fn() }));

const EGG = { id: 1, name: 'egg' };
const BUTTER = { id: 2, name: 'butter' };
const BREAD = { id: 3, name: 'bread' };
const CATALOG = [EGG, BUTTER, BREAD];

async function renderLoaded() {
  getIngredients.mockResolvedValue(CATALOG);
  matchRecipes.mockResolvedValue([]);
  const hook = renderHook(() => useSearchState());
  await waitFor(() => expect(hook.result.current.catalog.status).toBe('success'));
  return hook;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useSearchState: the starting point', () => {
  it('starts with an empty selection, no limit, and a catalog that is loading', () => {
    getIngredients.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSearchState());

    expect(result.current.catalog.status).toBe('loading');
    expect(result.current.matches.status).toBe('idle');
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.selected).toEqual([]);
    expect(result.current.maxMissing).toBe('');
  });

  it('exposes the loaded catalog', async () => {
    const { result } = await renderLoaded();

    expect(result.current.catalog.data).toEqual(CATALOG);
  });
});

describe('useSearchState: the selection', () => {
  it('toggle adds an id, and toggling it again removes it', async () => {
    const { result } = await renderLoaded();

    act(() => result.current.toggle(2));
    expect(result.current.selectedIds).toEqual([2]);

    act(() => result.current.toggle(2));
    expect(result.current.selectedIds).toEqual([]);
  });

  it('keeps ids in the order they were picked, but lists chips in catalog order', async () => {
    const { result } = await renderLoaded();

    act(() => result.current.toggle(3));
    act(() => result.current.toggle(1));

    expect(result.current.selectedIds).toEqual([3, 1]);
    expect(result.current.selected).toEqual([EGG, BREAD]);
  });

  it('remove drops one id and ignores an id that is not selected', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.toggle(1));
    act(() => result.current.toggle(2));

    act(() => result.current.remove(1));
    expect(result.current.selectedIds).toEqual([2]);

    act(() => result.current.remove(99));
    expect(result.current.selectedIds).toEqual([2]);
  });

  it('clear empties the selection', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.toggle(1));
    act(() => result.current.toggle(2));

    act(() => result.current.clear());

    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.selected).toEqual([]);
  });
});

describe('useSearchState: searching', () => {
  it('submit searches with the selected ids and the chosen limit', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.toggle(3));
    act(() => result.current.toggle(1));
    act(() => result.current.setMaxMissing('0'));

    await act(async () => {
      result.current.submit();
    });

    expect(result.current.maxMissing).toBe('0');
    expect(matchRecipes).toHaveBeenCalledWith([3, 1], {
      maxMissing: '0',
      signal: expect.any(AbortSignal),
    });
    expect(result.current.matches.status).toBe('success');
  });

  it('does not search until submit is called', async () => {
    const { result } = await renderLoaded();

    act(() => result.current.toggle(1));
    act(() => result.current.setMaxMissing('1'));

    expect(matchRecipes).not.toHaveBeenCalled();
    expect(result.current.matches.status).toBe('idle');
  });

  it('keeps the selection after a search, so it can be adjusted and run again', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.toggle(1));

    await act(async () => {
      result.current.submit();
    });

    expect(result.current.selectedIds).toEqual([1]);
  });
});