import type { BuildManifest } from '../../server/get-page-files'
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
  scriptLoader: { afterInteractive?: string[]; beforeInteractive?: any[] }
  locale?: string
  disableOptimizedLoading?: boolean
  styles?: React.ReactElement[] | React.ReactFragment
  head?: Array<JSX.Element | null>
  crossOrigin?: string
  optimizeCss?: boolean
  optimizeFonts?: boolean
  optimizeScripts?: {
    enablePartytown?: boolean
    partytownConfig?: any
  }
  runtime?: 'edge' | 'nodejs'
}

export const HtmlContext = createContext<HtmlProps>(null as any)
if (process.env.NODE_ENV !== 'production') {
  HtmlContext.displayName = 'HtmlContext'
}
