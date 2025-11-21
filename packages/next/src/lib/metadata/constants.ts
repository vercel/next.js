import type { ViewportLayout } from './types/extra-types'
import type { Icons } from './types/metadata-types'

export const ViewportMetaKeys: { [k in keyof ViewportLayout]: string } = {
  width: 'width',
  height: 'height',
  initialScale: 'initial-scale',
  minimumScale: 'minimum-scale',
  maximumScale: 'maximum-scale',
  viewportFit: 'viewport-fit',
  userScalable: 'user-scalable',
  interactiveWidget: 'interactive-widget',
} as const

export const IconKeys: (keyof Icons)[] = ['icon', 'shortcut', 'apple', 'other']
