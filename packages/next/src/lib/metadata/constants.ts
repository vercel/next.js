import type { Viewport } from './types/extra-types'
import type { Icons } from './types/metadata-types'

export const ViewPortKeys: { [k in keyof Viewport]: string } = {
  width: 'width',
  height: 'height',
  initialScale: 'initial-scale',
  minimumScale: 'minimum-scale',
  maximumScale: 'maximum-scale',
  viewportFit: 'viewport-fit',
  interactiveWidget: 'interactive-widget',
} as const

export const IconKeys: (keyof Icons)[] = ['icon', 'shortcut', 'apple', 'other']
