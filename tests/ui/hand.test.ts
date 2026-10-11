/**
 * The hand tray's arrow sprites.
 *
 * Only the size policy is testable here, and that is the point: `previewSizeFor` is pure so the
 * decision can be checked in Node, because nothing else about this can be. jsdom reports zero for
 * every width, so it cannot verify that the right size was *chosen*; and the harness cannot either,
 * since the change is 22px and the tightest device in the matrix has about 23px of slack. Verified
 * by mutation: reverting the sprite to its full size on every card leaves all 745 tests green.
 */

import { describe, expect, it } from 'vitest';
import {
  PREVIEW_NARROW_PX,
  PREVIEW_SIZE,
  PREVIEW_SIZE_SMALL,
  previewSizeFor,
} from '../../src/ui/components/hand.ts';

describe('the arrow sprite size policy', () => {
  it('shrinks on a card too narrow for the full sprite', () => {
    // 57px cards on a 360px phone, 171px on a 1440px desktop.
    expect(previewSizeFor(57)).toBe(PREVIEW_SIZE_SMALL);
    expect(previewSizeFor(95)).toBe(PREVIEW_SIZE_SMALL);
    expect(previewSizeFor(PREVIEW_NARROW_PX)).toBe(PREVIEW_SIZE);
    expect(previewSizeFor(171)).toBe(PREVIEW_SIZE);
  });

  it('uses the full size when there is no width to go on', () => {
    // Every canvas measures zero in jsdom, and every card measures zero before it is in the
    // document. Falling back to the size this has always used keeps both cases harmless.
    expect(previewSizeFor(0)).toBe(PREVIEW_SIZE);
    expect(previewSizeFor(Number.NaN)).toBe(PREVIEW_SIZE);
  });
});
