/**
 * Entry point. Stage 0 deliberately does almost nothing: mount the canvas and prove the toolchain
 * end to end. The screen router (ui/app.ts) and board rendering (render/boardView.ts) arrive in
 * Stages 6 and 7.
 */

const CANVAS_SIZE = 480;

function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#board');
  const note = document.querySelector<HTMLParagraphElement>('#boot-note');
  if (!canvas) throw new Error('boot: #board canvas is missing from index.html');

  // HiDPI-correct backing store so the Stage 6 renderer gets crisp pixels for free.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_SIZE * dpr;
  canvas.height = CANVAS_SIZE * dpr;
  canvas.style.width = `${CANVAS_SIZE}px`;
  canvas.style.height = `${CANVAS_SIZE}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('boot: 2d canvas context unavailable');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.strokeStyle = '#2a3040';
  ctx.strokeRect(8.5, 8.5, CANVAS_SIZE - 17, CANVAS_SIZE - 17);

  if (note) note.textContent = `Tetra Master — canvas mounted at ${CANVAS_SIZE}px (dpr ${dpr}).`;
}

boot();
