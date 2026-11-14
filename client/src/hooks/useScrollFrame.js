import { useLayoutEffect, useState } from 'react';

// From the top of the first row to the bottom of row `rows`, gaps included, rounded up
// so the last row is never cut. null when nothing needs a frame or nothing is laid out.
function measure(list, rows) {
  const items = list.children;
  if (items.length <= rows) {
    return null;
  }
  const top = items[0].getBoundingClientRect().top;
  const bottom = items[rows - 1].getBoundingClientRect().bottom;
  const span = Math.ceil(bottom - top);
  return span > 0 ? span : null;
}

// The height in px that shows exactly `scrollAfter` rows of the list in listRef, or null
// (no frame needed, or no ResizeObserver: the CSS fallback height applies).
export function useScrollFrame(listRef, scrollAfter) {
  const [height, setHeight] = useState(null);

  // No dependency list: this runs after every render, because a sort or a search can
  // change which rows come first without changing how many there are. Layout effect, so
  // the height is set before the browser paints. Setting the same number again is a no-op,
  // so this can't loop (a test pins it), which is why the lint rule is off for this line.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') {
      setHeight(null);
      return undefined;
    }

    const update = () => setHeight(measure(list, scrollAfter));
    update();
    if (list.children.length <= scrollAfter) {
      return undefined;
    }

    // Watch the rows, not the list: once the frame is capped, a row opening inside it
    // doesn't change the list's own size.
    const observer = new ResizeObserver(update);
    for (const row of [...list.children].slice(0, scrollAfter)) {
      observer.observe(row);
    }
    return () => observer.disconnect();
  });

  return height;
}
