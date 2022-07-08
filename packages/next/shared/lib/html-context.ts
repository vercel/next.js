import type { BuildManifest } from '../../server/get-page-files'
import type { ServerRuntime } from '../../server/config-shared'
import type { NEXT_DATA } from './utils'

import { createContext } from 'react'

export type HtmlProps = {
  __NEXT_DATA__: NEXT_DATA
  dangerousAsPath: string
  docComponentsRendered: {
    Html?: boolean
    Main?: boolean
    Head?: boolean
    NextScript?: boolean
  }
  buildManifest: BuildManifest
  ampPath: string
  inAmpMode: boolean
  hybridAmp: boolean
  isDevelopment: boolean
  dynamicImports: string[]
  assetPrefix?: string
  canonicalBase: string
  headTags: any[]
  unstable_runtimeJS?: false
  unstable_JsPreload?: false
  devOnlyCacheBusterQueryString: string
  scriptLoader: {
    afterInteractive?: string[]
    beforeInteractive?: any[]
    worker?: any[]
  }
  locale?: string
  disableOptimizedLoading?: boolean
  styles?: React.ReactElement[] | React.ReactFragment
  head?: Array<JSX.Element | null>
  crossOrigin?: string
  optimizeCss?: boolean
  optimizeFonts?: boolean
  nextScriptWorkers?: boolean
  runtime?: ServerRuntime
  hasConcurrentFeatures?: boolean
  largePageDataBytes?: number
}

export const HtmlContext = createContext<HtmlProps>(null as any)
if (process.env.NODE_ENV !== 'production') {
  HtmlContext.displayName = 'HtmlContext'
}
