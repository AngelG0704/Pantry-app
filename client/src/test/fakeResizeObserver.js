import { vi } from 'vitest';
import { act } from '@testing-library/react';

// jsdom does no layout and has no ResizeObserver. This fake records what it watches;
// fireResize() calls back every observer that is still connected, like a real resize.
export class FakeResizeObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    this.connected = true;
    FakeResizeObserver.instances.push(this);
  }

  observe(element) {
    this.observed.push(element);
  }

  unobserve(element) {
    this.observed = this.observed.filter((observed) => observed !== element);
  }

  disconnect() {
    this.observed = [];
    this.connected = false;
  }
}

// Call in beforeEach; undo with vi.unstubAllGlobals() in afterEach.
export function installFakeResizeObserver() {
  FakeResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
}

export function liveObservers() {
  return FakeResizeObserver.instances.filter((observer) => observer.connected);
}

export function fireResize() {
  act(() => {
    for (const observer of liveObservers()) {
      observer.callback([], observer);
    }
  });
}

// Gives every <li> a box: stacked under its earlier siblings from top 100, `gap` px
// apart, heightOf(li) px tall (decided from what the row shows right now). Other
// elements keep jsdom's all-zero box. Undo with vi.restoreAllMocks() in afterEach.
export function stubRowLayout(heightOf, gap = 0) {
  const original = Element.prototype.getBoundingClientRect;
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.tagName !== 'LI') {
      return original.call(this);
    }
    let top = 100;
    for (const sibling of this.parentElement.children) {
      if (sibling === this) {
        break;
      }
      top += heightOf(sibling) + gap;
    }
    const height = heightOf(this);
    return { top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top };
  });
}
