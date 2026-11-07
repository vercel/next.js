import {
  isWebpackAppPagesLayer,
  shouldUseReactServerCondition,
} from '../../packages/next/src/build/webpack-layer-utils'
import { WEBPACK_LAYERS } from '../../packages/next/src/lib/constants'

describe('webpack layer helpers', () => {
  it('recognizes server-only layers', () => {
    for (const layer of WEBPACK_LAYERS.GROUP.serverOnly) {
      expect(shouldUseReactServerCondition(layer)).toBeTrue()
    }

    expect(shouldUseReactServerCondition(undefined)).toBeFalse()
  })

  it('recognizes App Router page layers', () => {
    for (const layer of WEBPACK_LAYERS.GROUP.appPages) {
      expect(isWebpackAppPagesLayer(layer)).toBeTrue()
    }

    expect(isWebpackAppPagesLayer(WEBPACK_LAYERS.pagesDirNode)).toBeFalse()
    expect(isWebpackAppPagesLayer(undefined)).toBeFalse()
  })
})
