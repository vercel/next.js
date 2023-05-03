import type { ParsedUrlQuery } from 'querystring'
import type { DomainLocale } from './config'
import type { ImageConfigComplete } from '../shared/lib/image-config'
import type { __ApiPreviewProps } from './api-utils'
import type { FontManifest, FontConfig } from './font-utils'
import type { LoadComponentsReturnType } from './load-components'
import type { ServerRuntime } from 'next/types'
import type { ClientReferenceManifest } from '../build/webpack/plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../build/webpack/plugins/next-font-manifest-plugin'

import React from 'react'
import { COMPILER_NAMES } from '../shared/lib/constants'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { PageNotFoundError } from '../shared/lib/utils'

if (process.env.NEXT_RUNTIME !== 'edge') {
  require('./node-polyfill-web-streams')
} else {
}

export type RenderOptsPartial = {
  buildId: string
  canonicalBase: string
  runtimeConfig?: { [key: string]: any }
  assetPrefix?: string
  err?: Error | null
  nextExport?: boolean
  dev?: boolean
  ampPath?: string
  ErrorDebug?: React.ComponentType<{ error: Error }>
  ampValidator?: (html: string, pathname: string) => Promise<void>
  ampSkipValidation?: boolean
  ampOptimizerConfig?: { [key: string]: any }
  isDataReq?: boolean
  params?: ParsedUrlQuery
  previewProps: __ApiPreviewProps
  basePath: string
  unstable_runtimeJS?: false
  unstable_JsPreload?: false
  optimizeFonts: FontConfig
  fontManifest?: FontManifest
  optimizeCss: any
  nextConfigOutput?: 'standalone' | 'export'
  nextScriptWorkers: any
  devOnlyCacheBusterQueryString?: string
  clientReferenceManifest?: ClientReferenceManifest
  serverCSSManifest?: any
  nextFontManifest?: NextFontManifest
  distDir?: string
  locale?: string
  locales?: string[]
  defaultLocale?: string
  domainLocales?: DomainLocale[]
  disableOptimizedLoading?: boolean
  supportsDynamicHTML: boolean
  isBot?: boolean
  runtime?: ServerRuntime
  serverComponents?: boolean
  customServer?: boolean
  crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined
  images: ImageConfigComplete
  largePageDataBytes?: number
  isOnDemandRevalidate?: boolean
  strictNextHead: boolean
  isMinimalMode?: boolean
  isRevalidate: boolean
}

export type RenderOpts = LoadComponentsReturnType & RenderOptsPartial

export const deserializeErr = (serializedErr: any) => {
  if (
    !serializedErr ||
    typeof serializedErr !== 'object' ||
    !serializedErr.stack
  ) {
    return serializedErr
  }
  let ErrorType: any = Error

  if (serializedErr.name === 'PageNotFoundError') {
    ErrorType = PageNotFoundError
  }

  const err = new ErrorType(serializedErr.message)
  err.stack = serializedErr.stack
  err.name = serializedErr.name
  ;(err as any).digest = serializedErr.digest

  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { decorateServerError } =
      require('next/dist/compiled/@next/react-dev-overlay/dist/middleware') as typeof import('next/dist/compiled/@next/react-dev-overlay/dist/middleware')
    decorateServerError(err, serializedErr.source || 'server')
  }
  return err
}

export function errorToJSON(err: Error) {
  let source: typeof COMPILER_NAMES.server | typeof COMPILER_NAMES.edgeServer =
    'server'

  if (process.env.NEXT_RUNTIME !== 'edge') {
    source =
      require('next/dist/compiled/@next/react-dev-overlay/dist/middleware').getErrorSource(
        err
      ) || 'server'
  }

  return {
    name: err.name,
    source,
    message: stripAnsi(err.message),
    stack: err.stack,
    digest: (err as any).digest,
  }
}
