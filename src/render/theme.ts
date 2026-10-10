/**
 * Visual tokens for the whole renderer (PLAN.md §7.5).
 *
 * Every colour, size and font used on screen is declared here, so the palette can be reviewed in
 * one place and the renderer never hardcodes a hex value. Ownership is expressed as **colour plus
 * a distinct frame shape**, never colour alone, so the board stays readable with any form of colour
 * vision deficiency.
 */

import { CELLS } from '../core/constants.ts';

/** Which seat a card or cell belongs to, for styling. */
export type Seat = 'player' | 'ai';

export const COLORS = {
  pageBackground: '#0b0d12',
  boardBackground: '#12151c',
  boardEdge: '#2a3040',

  cell: '#171b24',
  cellEdge: '#242a37',
  cellBlocked: '#0e1116',
  cellBlockedEdge: '#1a1e26',
  cellLegal: '#1f2a3d',
  cellLegalEdge: '#3d5a8a',
  cellHover: '#26324a',
  cellPendingBattle: '#4a2f4f',
  cellPendingEdge: '#8a5a9c',

  ink: '#e6e9f0',
  inkMuted: '#8b93a7',
  inkFaint: '#5a6274',

  cardFace: '#202634',
  cardFrame: '#39415a',
  cardFrameThick: '#5a6480',

  accent: '#7aa2f7',
  good: '#7ddc9a',
  bad: '#e88b8b',
} as const;

/**
 * Per-seat styling. The frame shape is the accessibility channel; the tint is the redundant one.
 */
export const SEATS: Record<
  Seat,
  { frame: string; glow: string; pip: string; shape: 'square' | 'hex' }
> = {
  player: { frame: '#5b8dd6', glow: 'rgba(91, 141, 214, 0.35)', pip: '#5b8dd6', shape: 'square' },
  ai: { frame: '#d68a5b', glow: 'rgba(214, 138, 91, 0.35)', pip: '#d68a5b', shape: 'hex' },
};

export const FONTS = {
  stat: '600 12px ui-monospace, "SF Mono", Menlo, monospace',
  statSmall: '600 10px ui-monospace, "SF Mono", Menlo, monospace',
  label: '500 12px system-ui, -apple-system, "Segoe UI", sans-serif',
  title: '600 13px system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

/** Board geometry, in CSS pixels. */
export const METRICS = {
  boardSize: 520,
  padding: 18,
  get cellSize(): number {
    return (this.boardSize - this.padding * 2) / Math.sqrt(CELLS) - this.gutter;
  },
  gutter: 6,
  cornerRadius: 8,
  /** How long a single animation beat lasts, in milliseconds. */
  beatMs: 240,
} as const;

/** Per-family hues for the procedural card art. Art is generated, never sourced (PLAN.md §7.5). */
export const FAMILY_HUE: Record<string, number> = {
  beast: 28,
  construct: 210,
  elemental: 8,
  spirit: 275,
  machine: 165,
  dragon: 340,
  humanoid: 45,
};

export function seatOf(owner: string): Seat {
  return owner === 'ai' ? 'ai' : 'player';
}
