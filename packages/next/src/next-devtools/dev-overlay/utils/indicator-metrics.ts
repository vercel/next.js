import { INDICATOR_PADDING } from '../components/devtools-indicator/devtools-indicator'
import type { OverlayState } from '../shared'

export const BASE_LOGO_SIZE = 36
const INDICATOR_GAP = 9

function getIndicatorSquare(state: OverlayState): number {
  return BASE_LOGO_SIZE / state.scale
}

export function getIndicatorOffset(state: OverlayState): number {
  return INDICATOR_PADDING + getIndicatorSquare(state) + INDICATOR_GAP
}
