import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollFrame } from './useScrollFrame.js';
import {
  fireResize as fire,
  installFakeResizeObserver,
  liveObservers,
} from '../test/fakeResizeObserver.js';

// Stacks the rows from top 100 (not 0, so the hook must subtract the first top),
// `gap` px apart, by stubbing each <li>'s getBoundingClientRect.
function layout(list, heights, gap = 0) {
  let top = 100;
  [...list.children].forEach((li, index) => {
    const box = { top, bottom: top + heights[index], height: heights[index] };
    li.getBoundingClientRect = () => box;
    top = box.bottom + gap;
  });
}

function makeList(heights, gap = 0) {
  const list = document.createElement('ul');
  heights.forEach(() => list.append(document.createElement('li')));
  layout(list, heights, gap);
  document.body.append(list);
  return list;
}

// 10 rows, the third one open (taller), 12px apart.
const HEIGHTS = [40, 40, 120, 40, 40, 40, 40, 40, 40, 40];
const GAP = 12;
// Rows 1-8: seven at 40 plus one at 120, and the 7 gaps between them.
const FIRST_EIGHT = 7 * 40 + 120 + 7 * GAP; // 484

describe('useScrollFrame', () => {
  beforeEach(() => {
    installFakeResizeObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('returns null when the list has scrollAfter items or fewer', () => {
    const ref = { current: makeList(HEIGHTS.slice(0, 8), GAP) };
    const { result } = renderHook(() => useScrollFrame(ref, 8));
    expect(result.current).toBeNull();
  });

  it('returns null without ResizeObserver, so the CSS fallback height applies', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const ref = { current: makeList(HEIGHTS, GAP) };
    const { result } = renderHook(() => useScrollFrame(ref, 8));
    expect(result.current).toBeNull();
  });

  it('returns null when the list is not rendered', () => {
    const ref = { current: null };
    const { result } = renderHook(() => useScrollFrame(ref, 8));
    expect(result.current).toBeNull();
  });

  it('measures from the top of the first row to the bottom of row scrollAfter', () => {
    const ref = { current: makeList(HEIGHTS, GAP) };
    const { result } = renderHook(() => useScrollFrame(ref, 8));
    expect(result.current).toBe(FIRST_EIGHT);
  });

  it('rounds a fractional height up, so the last row is never cut', () => {
    const ref = { current: makeList(Array(9).fill(40.3)) };
    const { result } = renderHook(() => useScrollFrame(ref, 8));
    // 8 x 40.3 = 322.4
    expect(result.current).toBe(323);
  });

  it('returns null when the rows have no size yet', () => {
    const ref = { current: makeList(Array(9).fill(0)) };
    const { result } = renderHook(() => useScrollFrame(ref, 8));
    expect(result.current).toBeNull();
  });

  it('measures again when a row changes size', () => {
    const list = makeList(HEIGHTS, GAP);
    const ref = { current: list };
    const { result } = renderHook(() => useScrollFrame(ref, 8));

    // Row 1 opens: 40 -> 200.
    layout(list, [200, ...HEIGHTS.slice(1)], GAP);
    fire();

    expect(result.current).toBe(FIRST_EIGHT + 160);
  });

  it('measures again after a render that changed the rows', () => {
    const list = makeList(HEIGHTS.slice(0, 8), GAP);
    const ref = { current: list };
    const { result, rerender } = renderHook(() => useScrollFrame(ref, 8));
    expect(result.current).toBeNull();

    list.append(document.createElement('li'));
    layout(list, HEIGHTS.slice(0, 9), GAP);
    rerender();
    expect(result.current).toBe(FIRST_EIGHT);

    list.lastElementChild.remove();
    rerender();
    expect(result.current).toBeNull();
  });

  it('watches the first scrollAfter rows with one observer at a time', () => {
    const list = makeList(HEIGHTS, GAP);
    const ref = { current: list };
    const { rerender } = renderHook(() => useScrollFrame(ref, 8));
    rerender();

    const live = liveObservers();
    expect(live).toHaveLength(1);
    expect(live[0].observed).toEqual([...list.children].slice(0, 8));
  });

  it('stops observing on unmount', () => {
    const ref = { current: makeList(HEIGHTS, GAP) };
    const { unmount } = renderHook(() => useScrollFrame(ref, 8));
    expect(liveObservers()).toHaveLength(1);

    unmount();
    expect(liveObservers()).toHaveLength(0);
  });

  it('does not render again when the measured height is unchanged', () => {
    const ref = { current: makeList(HEIGHTS, GAP) };
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useScrollFrame(ref, 8);
    });
    const before = renders;

    fire();
    fire();

    expect(renders).toBe(before);
  });
});
