let renders = 0

/**
 * Changes on every server render, so a test can wait for a segment to actually
 * re-render without depending on the `useId` values it is asserting about.
 */
export function nextRenderId(): string {
  return String(++renders)
}
