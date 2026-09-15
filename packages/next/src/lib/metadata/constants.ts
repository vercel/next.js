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

/**
 * The element streamed metadata is rendered inside. React needs a host
 * element around a top-level Suspense boundary, and this one becomes the
 * first child of `<body>`. It is a custom element rather than a `<div>`
 * because React hydrates `<body>` children by tag name: a third-party script
 * that prepends its own `<div>` to `<body>` before hydration would otherwise
 * be claimed for this wrapper, hydration would fail, and the client-side
 * regeneration would delete the third party's DOM.
 */
export const HIDDEN_METADATA_WRAPPER_TAG = 'next-metadata'
