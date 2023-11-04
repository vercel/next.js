import React from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  OPTIMIZED_FONT_PROVIDERS,
  NEXT_BUILTIN_DOCUMENT,
} from '../shared/lib/constants'
import type {
  DocumentContext,
  DocumentInitialProps,
  DocumentProps,
  DocumentType,
  NEXT_DATA,
} from '../shared/lib/utils'
import type { ScriptProps } from '../client/script'
import type { NextFontManifest } from '../build/webpack/plugins/next-font-manifest-plugin'

import { getPageFiles } from '../server/get-page-files'
import type { BuildManifest } from '../server/get-page-files'
import { htmlEscapeJsonString } from '../server/htmlescape'
import isError from '../lib/is-error'

import {
  HtmlContext,
  useHtmlContext,
} from '../shared/lib/html-context.shared-runtime'
import type { HtmlProps } from '../shared/lib/html-context.shared-runtime'

export type { DocumentContext, DocumentInitialProps, DocumentProps }

export type OriginProps = {
  nonce?: string
  crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined
  children?: React.ReactNode
}

type DocumentFiles = {
  sharedFiles: readonly string[]
  pageFiles: readonly string[]
  allFiles: readonly string[]
}

type HeadHTMLProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLHeadElement>,
  HTMLHeadElement
>

type HeadProps = OriginProps & HeadHTMLProps

/** Set of pages that have triggered a large data warning on production mode. */
const largePageDataWarnings = new Set<string>()

function getDocumentFiles(
  buildManifest: BuildManifest,
  pathname: string,
  inAmpMode: boolean
): DocumentFiles {
  const sharedFiles: readonly string[] = getPageFiles(buildManifest, '/_app')
  const pageFiles: readonly string[] =
    process.env.NEXT_RUNTIME !== 'edge' && inAmpMode
      ? []
      : getPageFiles(buildManifest, pathname)

  return {
    sharedFiles,
    pageFiles,
    allFiles: [...new Set([...sharedFiles, ...pageFiles])],
  }
}

function getPolyfillScripts(context: HtmlProps, props: OriginProps) {
  // polyfills.js has to be rendered as nomodule without async
  // It also has to be the first script to load
  const {
    assetPrefix,
    buildManifest,
    assetQueryString,
    disableOptimizedLoading,
    crossOrigin,
  } = context

  return buildManifest.polyfillFiles
    .filter(
      (polyfill) => polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
    )
    .map((polyfill) => (
      <script
        key={polyfill}
        defer={!disableOptimizedLoading}
        nonce={props.nonce}
        crossOrigin={props.crossOrigin || crossOrigin}
        noModule={true}
        src={`${assetPrefix}/_next/${polyfill}${assetQueryString}`}
      />
    ))
}

function hasComponentProps(child: any): child is React.ReactElement {
  return !!child && !!child.props
}

function AmpStyles({
  styles,
}: {
  styles?: React.ReactElement[] | React.ReactFragment
}) {
  if (!styles) return null

  // try to parse styles from fragment for backwards compat
  const curStyles: React.ReactElement[] = Array.isArray(styles)
    ? (styles as React.ReactElement[])
    : []
  if (
    // @ts-ignore Property 'props' does not exist on type ReactElement
    styles.props &&
    // @ts-ignore Property 'props' does not exist on type ReactElement
    Array.isArray(styles.props.children)
  ) {
    const hasStyles = (el: React.ReactElement) =>
      el?.props?.dangerouslySetInnerHTML?.__html
    // @ts-ignore Property 'props' does not exist on type ReactElement
    styles.props.children.forEach((child: React.ReactElement) => {
      if (Array.isArray(child)) {
        child.forEach((el) => hasStyles(el) && curStyles.push(el))
      } else if (hasStyles(child)) {
        curStyles.push(child)
      }
    })
  }

  /* Add custom styles before AMP styles to prevent accidental overrides */
  return (
    <style
      amp-custom=""
      dangerouslySetInnerHTML={{
        __html: curStyles
          .map((style) => style.props.dangerouslySetInnerHTML.__html)
          .join('')
          .replace(/\/\*# sourceMappingURL=.*\*\//g, '')
          .replace(/\/\*@ sourceURL=.*?\*\//g, ''),
      }}
    />
  )
}

function getDynamicChunks(
  context: HtmlProps,
  props: OriginProps,
  files: DocumentFiles
) {
  const {
    dynamicImports,
    assetPrefix,
    isDevelopment,
    assetQueryString,
    disableOptimizedLoading,
    crossOrigin,
  } = context

  return dynamicImports.map((file) => {
    if (!file.endsWith('.js') || files.allFiles.includes(file)) return null

    return (
      <script
        async={!isDevelopment && disableOptimizedLoading}
        defer={!disableOptimizedLoading}
        key={file}
        src={`${assetPrefix}/_next/${encodeURI(file)}${assetQueryString}`}
        nonce={props.nonce}
        crossOrigin={props.crossOrigin || crossOrigin}
      />
    )
  })
}

function getScripts(
  context: HtmlProps,
  props: OriginProps,
  files: DocumentFiles
) {
  const {
    assetPrefix,
    buildManifest,
    isDevelopment,
    assetQueryString,
    disableOptimizedLoading,
    crossOrigin,
  } = context

  const normalScripts = files.allFiles.filter((file) => file.endsWith('.js'))
  const lowPriorityScripts = buildManifest.lowPriorityFiles?.filter((file) =>
    file.endsWith('.js')
  )

  return [...normalScripts, ...lowPriorityScripts].map((file) => {
    return (
      <script
        key={file}
        src={`${assetPrefix}/_next/${encodeURI(file)}${assetQueryString}`}
        nonce={props.nonce}
        async={!isDevelopment && disableOptimizedLoading}
        defer={!disableOptimizedLoading}
        crossOrigin={props.crossOrigin || crossOrigin}
      />
    )
  })
}

function getPreNextWorkerScripts(context: HtmlProps, props: OriginProps) {
  const { assetPrefix, scriptLoader, crossOrigin, nextScriptWorkers } = context

  // disable `nextScriptWorkers` in edge runtime
  if (!nextScriptWorkers || process.env.NEXT_RUNTIME === 'edge') return null

  try {
    let {
      partytownSnippet,
      // @ts-ignore: Prevent webpack from processing this require
    } = __non_webpack_require__('@builder.io/partytown/integration'!)

    const children = Array.isArray(props.children)
      ? props.children
      : [props.children]

    // Check to see if the user has defined their own Partytown configuration
    const userDefinedConfig = children.find(
      (child) =>
        hasComponentProps(child) &&
        child?.props?.dangerouslySetInnerHTML?.__html.length &&
        'data-partytown-config' in child.props
    )

    return (
      <>
        {!userDefinedConfig && (
          <script
            data-partytown-config=""
            dangerouslySetInnerHTML={{
              __html: `
            partytown = {
              lib: "${assetPrefix}/_next/static/~partytown/"
            };
          `,
            }}
          />
        )}
        <script
          data-partytown=""
          dangerouslySetInnerHTML={{
            __html: partytownSnippet(),
          }}
        />
        {(scriptLoader.worker || []).map((file: ScriptProps, index: number) => {
          const {
            strategy,
            src,
            children: scriptChildren,
            dangerouslySetInnerHTML,
            ...scriptProps
          } = file

          let srcProps: {
            src?: string
            dangerouslySetInnerHTML?: ScriptProps['dangerouslySetInnerHTML']
          } = {}

          if (src) {
            // Use external src if provided
            srcProps.src = src
          } else if (
            dangerouslySetInnerHTML &&
            dangerouslySetInnerHTML.__html
          ) {
            // Embed inline script if provided with dangerouslySetInnerHTML
            srcProps.dangerouslySetInnerHTML = {
              __html: dangerouslySetInnerHTML.__html,
            }
          } else if (scriptChildren) {
            // Embed inline script if provided with children
            srcProps.dangerouslySetInnerHTML = {
              __html:
                typeof scriptChildren === 'string'
                  ? scriptChildren
                  : Array.isArray(scriptChildren)
                  ? scriptChildren.join('')
                  : '',
            }
          } else {
            throw new Error(
              'Invalid usage of next/script. Did you forget to include a src attribute or an inline script? https://nextjs.org/docs/messages/invalid-script'
            )
          }

          return (
            <script
              {...srcProps}
              {...scriptProps}
              type="text/partytown"
              key={src || index}
              nonce={props.nonce}
              data-nscript="worker"
              crossOrigin={props.crossOrigin || crossOrigin}
            />
          )
        })}
      </>
    )
  } catch (err) {
    if (isError(err) && err.code !== 'MODULE_NOT_FOUND') {
      console.warn(`Warning: ${err.message}`)
    }
    return null
  }
}

function getPreNextScripts(context: HtmlProps, props: OriginProps) {
  const { scriptLoader, disableOptimizedLoading, crossOrigin } = context

  const webWorkerScripts = getPreNextWorkerScripts(context, props)

  const beforeInteractiveScripts = (scriptLoader.beforeInteractive || [])
    .filter((script) => script.src)
    .map((file: ScriptProps, index: number) => {
      const { strategy, ...scriptProps } = file
      return (
        <script
          {...scriptProps}
          key={scriptProps.src || index}
          defer={scriptProps.defer ?? !disableOptimizedLoading}
          nonce={props.nonce}
          data-nscript="beforeInteractive"
          crossOrigin={props.crossOrigin || crossOrigin}
        />
      )
    })

  return (
    <>
      {webWorkerScripts}
      {beforeInteractiveScripts}
    </>
  )
}

function getHeadHTMLProps(props: HeadProps) {
  const { crossOrigin, nonce, ...restProps } = props

  // This assignment is necessary for additional type checking to avoid unsupported attributes in <head>
  const headProps: HeadHTMLProps & {
    [P in Exclude<keyof HeadProps, keyof HeadHTMLProps>]?: never
  } = restProps

  return headProps
}

function getAmpPath(ampPath: string, asPath: string): string {
  return ampPath || `${asPath}${asPath.includes('?') ? '&' : '?'}amp=1`
}

function getNextFontLinkTags(
  nextFontManifest: NextFontManifest | undefined,
  dangerousAsPath: string,
  assetPrefix: string = ''
) {
  if (!nextFontManifest) {
    return {
      preconnect: null,
      preload: null,
    }
  }

  const appFontsEntry = nextFontManifest.pages['/_app']
  const pageFontsEntry = nextFontManifest.pages[dangerousAsPath]

  const preloadedFontFiles = [
    ...(appFontsEntry ?? []),
    ...(pageFontsEntry ?? []),
  ]

  // If no font files should preload but there's an entry for the path, add a preconnect tag.
  const preconnectToSelf = !!(
    preloadedFontFiles.length === 0 &&
    (appFontsEntry || pageFontsEntry)
  )

  return {
    preconnect: preconnectToSelf ? (
      <link
        data-next-font={
          nextFontManifest.pagesUsingSizeAdjust ? 'size-adjust' : ''
        }
        rel="preconnect"
        href="/"
        crossOrigin="anonymous"
      />
    ) : null,
    preload: preloadedFontFiles
      ? preloadedFontFiles.map((fontFile) => {
          const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFile)![1]
          return (
            <link
              key={fontFile}
              rel="preload"
              href={`${assetPrefix}/_next/${encodeURI(fontFile)}`}
              as="font"
              type={`font/${ext}`}
              crossOrigin="anonymous"
              data-next-font={fontFile.includes('-s') ? 'size-adjust' : ''}
            />
          )
        })
      : null,
  }
}

// Use `React.Component` to avoid errors from the RSC checks because
// it can't be imported directly in Server Components:
//
//   import { Component } from 'react'
//
// More info: https://github.com/vercel/next.js/pull/40686
export class Head extends React.Component<HeadProps> {
  static contextType = HtmlContext

  context!: HtmlProps

  getCssLinks(files: DocumentFiles): JSX.Element[] | null {
    const {
      assetPrefix,
      assetQueryString,
      dynamicImports,
      crossOrigin,
      optimizeCss,
      optimizeFonts,
    } = this.context
    const cssFiles = files.allFiles.filter((f) => f.endsWith('.css'))
    const sharedFiles: Set<string> = new Set(files.sharedFiles)

    // Unmanaged files are CSS files that will be handled directly by the
    // webpack runtime (`mini-css-extract-plugin`).
    let unmangedFiles: Set<string> = new Set([])
    let dynamicCssFiles = Array.from(
      new Set(dynamicImports.filter((file) => file.endsWith('.css')))
    )
    if (dynamicCssFiles.length) {
      const existing = new Set(cssFiles)
      dynamicCssFiles = dynamicCssFiles.filter(
        (f) => !(existing.has(f) || sharedFiles.has(f))
      )
      unmangedFiles = new Set(dynamicCssFiles)
      cssFiles.push(...dynamicCssFiles)
    }

    let cssLinkElements: JSX.Element[] = []
    cssFiles.forEach((file) => {
      const isSharedFile = sharedFiles.has(file)

      if (!optimizeCss) {
        cssLinkElements.push(
          <link
            key={`${file}-preload`}
            nonce={this.props.nonce}
            rel="preload"
            href={`${assetPrefix}/_next/${encodeURI(file)}${assetQueryString}`}
            as="style"
            crossOrigin={this.props.crossOrigin || crossOrigin}
          />
        )
      }

      const isUnmanagedFile = unmangedFiles.has(file)
      cssLinkElements.push(
        <link
          key={file}
          nonce={this.props.nonce}
          rel="stylesheet"
          href={`${assetPrefix}/_next/${encodeURI(file)}${assetQueryString}`}
          crossOrigin={this.props.crossOrigin || crossOrigin}
          data-n-g={isUnmanagedFile ? undefined : isSharedFile ? '' : undefined}
          data-n-p={isUnmanagedFile ? undefined : isSharedFile ? undefined : ''}
        />
      )
    })

    if (process.env.NODE_ENV !== 'development' && optimizeFonts) {
      cssLinkElements = this.makeStylesheetInert(
        cssLinkElements
      ) as ReactElement[]
    }

    return cssLinkElements.length === 0 ? null : cssLinkElements
  }

  getPreloadDynamicChunks() {
    const { dynamicImports, assetPrefix, assetQueryString, crossOrigin } =
      this.context

    return (
      dynamicImports
        .map((file) => {
          if (!file.endsWith('.js')) {
            return null
          }

          return (
            <link
              rel="preload"
              key={file}
              href={`${assetPrefix}/_next/${encodeURI(
                file
              )}${assetQueryString}`}
              as="script"
              nonce={this.props.nonce}
              crossOrigin={this.props.crossOrigin || crossOrigin}
            />
          )
        })
        // Filter out nulled scripts
        .filter(Boolean)
    )
  }

  getPreloadMainLinks(files: DocumentFiles): JSX.Element[] | null {
    const { assetPrefix, assetQueryString, scriptLoader, crossOrigin } =
      this.context
    const preloadFiles = files.allFiles.filter((file: string) => {
      return file.endsWith('.js')
    })

    return [
      ...(scriptLoader.beforeInteractive || []).map((file) => (
        <link
          key={file.src}
          nonce={this.props.nonce}
          rel="preload"
          href={file.src}
          as="script"
          crossOrigin={this.props.crossOrigin || crossOrigin}
        />
      )),
      ...preloadFiles.map((file: string) => (
        <link
          key={file}
          nonce={this.props.nonce}
          rel="preload"
          href={`${assetPrefix}/_next/${encodeURI(file)}${assetQueryString}`}
          as="script"
          crossOrigin={this.props.crossOrigin || crossOrigin}
        />
      )),
    ]
  }

  getBeforeInteractiveInlineScripts() {
    const { scriptLoader } = this.context
    const { nonce, crossOrigin } = this.props

    return (scriptLoader.beforeInteractive || [])
      .filter(
        (script) =>
          !script.src && (script.dangerouslySetInnerHTML || script.children)
      )
      .map((file: ScriptProps, index: number) => {
        const {
          strategy,
          children,
          dangerouslySetInnerHTML,
          src,
          ...scriptProps
        } = file
        let html: NonNullable<
          ScriptProps['dangerouslySetInnerHTML']
        >['__html'] = ''

        if (dangerouslySetInnerHTML && dangerouslySetInnerHTML.__html) {
          html = dangerouslySetInnerHTML.__html
        } else if (children) {
          html =
            typeof children === 'string'
              ? children
              : Array.isArray(children)
              ? children.join('')
              : ''
        }

        return (
          <script
            {...scriptProps}
            dangerouslySetInnerHTML={{ __html: html }}
            key={scriptProps.id || index}
            nonce={nonce}
            data-nscript="beforeInteractive"
            crossOrigin={
              crossOrigin ||
              (process.env.__NEXT_CROSS_ORIGIN as typeof crossOrigin)
            }
          />
        )
      })
  }

  getDynamicChunks(files: DocumentFiles) {
    return getDynamicChunks(this.context, this.props, files)
  }

  getPreNextScripts() {
    return getPreNextScripts(this.context, this.props)
  }

  getScripts(files: DocumentFiles) {
    return getScripts(this.context, this.props, files)
  }

  getPolyfillScripts() {
    return getPolyfillScripts(this.context, this.props)
  }

  makeStylesheetInert(node: ReactNode[]): ReactNode[] {
    return React.Children.map(node, (c: any) => {
      if (
        c?.type === 'link' &&
        c?.props?.href &&
        OPTIMIZED_FONT_PROVIDERS.some(({ url }) =>
          c?.props?.href?.startsWith(url)
        )
      ) {
        const newProps = {
          ...(c.props || {}),
          'data-href': c.props.href,
          href: undefined,
        }

        return React.cloneElement(c, newProps)
      } else if (c?.props?.children) {
        const newProps = {
          ...(c.props || {}),
          children: this.makeStylesheetInert(c.props.children),
        }

        return React.cloneElement(c, newProps)
      }

      return c
      // @types/react bug. Returned value from .map will not be `null` if you pass in `[null]`
    })!.filter(Boolean)
  }

  render() {
    const {
      styles,
      ampPath,
      inAmpMode,
      hybridAmp,
      canonicalBase,
      __NEXT_DATA__,
      dangerousAsPath,
      headTags,
      unstable_runtimeJS,
      unstable_JsPreload,
      disableOptimizedLoading,
      optimizeCss,
      optimizeFonts,
      assetPrefix,
      nextFontManifest,
    } = this.context

    const disableRuntimeJS = unstable_runtimeJS === false
    const disableJsPreload =
      unstable_JsPreload === false || !disableOptimizedLoading

    this.context.docComponentsRendered.Head = true

    let { head } = this.context
    let cssPreloads: Array<JSX.Element> = []
    let otherHeadElements: Array<JSX.Element> = []
    if (head) {
      head.forEach((c) => {
        let metaTag

        if (this.context.strictNextHead) {
          metaTag = React.createElement('meta', {
            name: 'next-head',
            content: '1',
          })
        }

        if (
          c &&
          c.type === 'link' &&
          c.props['rel'] === 'preload' &&
          c.props['as'] === 'style'
        ) {
          metaTag && cssPreloads.push(metaTag)
          cssPreloads.push(c)
        } else {
          if (c) {
            if (metaTag && (c.type !== 'meta' || !c.props['charSet'])) {
              otherHeadElements.push(metaTag)
            }
            otherHeadElements.push(c)
          }
        }
      })
      head = cssPreloads.concat(otherHeadElements)
    }
    let children: React.ReactNode[] = React.Children.toArray(
      this.props.children
    ).filter(Boolean)
    // show a warning if Head contains <title> (only in development)
    if (process.env.NODE_ENV !== 'production') {
      children = React.Children.map(children, (child: any) => {
        const isReactHelmet = child?.props?.['data-react-helmet']
        if (!isReactHelmet) {
          if (child?.type === 'title') {
            console.warn(
              "Warning: <title> should not be used in _document.js's <Head>. https://nextjs.org/docs/messages/no-document-title"
            )
          } else if (
            child?.type === 'meta' &&
            child?.props?.name === 'viewport'
          ) {
            console.warn(
              "Warning: viewport meta tags should not be used in _document.js's <Head>. https://nextjs.org/docs/messages/no-document-viewport-meta"
            )
          }
        }
        return child
        // @types/react bug. Returned value from .map will not be `null` if you pass in `[null]`
      })!
      if (this.props.crossOrigin)
        console.warn(
          'Warning: `Head` attribute `crossOrigin` is deprecated. https://nextjs.org/docs/messages/doc-crossorigin-deprecated'
        )
    }

    if (
      process.env.NODE_ENV !== 'development' &&
      optimizeFonts &&
      !(process.env.NEXT_RUNTIME !== 'edge' && inAmpMode)
    ) {
      children = this.makeStylesheetInert(children)
    }

    let hasAmphtmlRel = false
    let hasCanonicalRel = false

    // show warning and remove conflicting amp head tags
    head = React.Children.map(head || [], (child) => {
      if (!child) return child
      const { type, props } = child
      if (process.env.NEXT_RUNTIME !== 'edge' && inAmpMode) {
        let badProp: string = ''

        if (type === 'meta' && props.name === 'viewport') {
          badProp = 'name="viewport"'
        } else if (type === 'link' && props.rel === 'canonical') {
          hasCanonicalRel = true
        } else if (type === 'script') {
          // only block if
          // 1. it has a src and isn't pointing to ampproject's CDN
          // 2. it is using dangerouslySetInnerHTML without a type or
          // a type of text/javascript
          if (
            (props.src && props.src.indexOf('ampproject') < -1) ||
            (props.dangerouslySetInnerHTML &&
              (!props.type || props.type === 'text/javascript'))
          ) {
            badProp = '<script'
            Object.keys(props).forEach((prop) => {
              badProp += ` ${prop}="${props[prop]}"`
            })
            badProp += '/>'
          }
        }

        if (badProp) {
          console.warn(
            `Found conflicting amp tag "${child.type}" with conflicting prop ${badProp} in ${__NEXT_DATA__.page}. https://nextjs.org/docs/messages/conflicting-amp-tag`
          )
          return null
        }
      } else {
        // non-amp mode
        if (type === 'link' && props.rel === 'amphtml') {
          hasAmphtmlRel = true
        }
      }
      return child
      // @types/react bug. Returned value from .map will not be `null` if you pass in `[null]`
    })!

    const files: DocumentFiles = getDocumentFiles(
      this.context.buildManifest,
      this.context.__NEXT_DATA__.page,
      process.env.NEXT_RUNTIME !== 'edge' && inAmpMode
    )

    const nextFontLinkTags = getNextFontLinkTags(
      nextFontManifest,
      dangerousAsPath,
      assetPrefix
    )

    return (
      <head {...getHeadHTMLProps(this.props)}>
        {this.context.isDevelopment && (
          <>
            <style
              data-next-hide-fouc
              data-ampdevmode={
                process.env.NEXT_RUNTIME !== 'edge' && inAmpMode
                  ? 'true'
                  : undefined
              }
              dangerouslySetInnerHTML={{
                __html: `body{display:none}`,
              }}
            />
            <noscript
              data-next-hide-fouc
              data-ampdevmode={
                process.env.NEXT_RUNTIME !== 'edge' && inAmpMode
                  ? 'true'
                  : undefined
              }
            >
              <style
                dangerouslySetInnerHTML={{
                  __html: `body{display:block}`,
                }}
              />
            </noscript>
          </>
        )}
        {head}
        {this.context.strictNextHead ? null : (
          <meta
            name="next-head-count"
            content={React.Children.count(head || []).toString()}
          />
        )}

        {children}
        {optimizeFonts && <meta name="next-font-preconnect" />}

        {nextFontLinkTags.preconnect}
        {nextFontLinkTags.preload}

        {process.env.NEXT_RUNTIME !== 'edge' && inAmpMode && (
          <>
            <meta
              name="viewport"
              content="width=device-width,minimum-scale=1,initial-scale=1"
            />
            {!hasCanonicalRel && (
              <link
                rel="canonical"
                href={
                  canonicalBase +
                  require('../server/utils').cleanAmpPath(dangerousAsPath)
                }
              />
            )}
            {/* https://www.ampproject.org/docs/fundamentals/optimize_amp#optimize-the-amp-runtime-loading */}
            <link
              rel="preload"
              as="script"
              href="https://cdn.ampproject.org/v0.js"
            />
            <AmpStyles styles={styles} />
            <style
              amp-boilerplate=""
              dangerouslySetInnerHTML={{
                __html: `body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}`,
              }}
            />
            <noscript>
              <style
                amp-boilerplate=""
                dangerouslySetInnerHTML={{
                  __html: `body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}`,
                }}
              />
            </noscript>
            <script async src="https://cdn.ampproject.org/v0.js" />
          </>
        )}
        {!(process.env.NEXT_RUNTIME !== 'edge' && inAmpMode) && (
          <>
            {!hasAmphtmlRel && hybridAmp && (
              <link
                rel="amphtml"
                href={canonicalBase + getAmpPath(ampPath, dangerousAsPath)}
              />
            )}
            {this.getBeforeInteractiveInlineScripts()}
            {!optimizeCss && this.getCssLinks(files)}
            {!optimizeCss && <noscript data-n-css={this.props.nonce ?? ''} />}

            {!disableRuntimeJS &&
              !disableJsPreload &&
              this.getPreloadDynamicChunks()}
            {!disableRuntimeJS &&
              !disableJsPreload &&
              this.getPreloadMainLinks(files)}

            {!disableOptimizedLoading &&
              !disableRuntimeJS &&
              this.getPolyfillScripts()}

            {!disableOptimizedLoading &&
              !disableRuntimeJS &&
              this.getPreNextScripts()}
            {!disableOptimizedLoading &&
              !disableRuntimeJS &&
              this.getDynamicChunks(files)}
            {!disableOptimizedLoading &&
              !disableRuntimeJS &&
              this.getScripts(files)}

            {optimizeCss && this.getCssLinks(files)}
            {optimizeCss && <noscript data-n-css={this.props.nonce ?? ''} />}
            {this.context.isDevelopment && (
              // this element is used to mount development styles so the
              // ordering matches production
              // (by default, style-loader injects at the bottom of <head />)
              <noscript id="__next_css__DO_NOT_USE__" />
            )}
            {styles || null}
          </>
        )}
        {React.createElement(React.Fragment, {}, ...(headTags || []))}
      </head>
    )
  }
}

function handleDocumentScriptLoaderItems(
  scriptLoader: { beforeInteractive?: any[] },
  __NEXT_DATA__: NEXT_DATA,
  props: any
): void {
  if (!props.children) return

  const scriptLoaderItems: ScriptProps[] = []

  const children = Array.isArray(props.children)
    ? props.children
    : [props.children]

  const headChildren = children.find(
    (child: React.ReactElement) => child.type === Head
  )?.props?.children
  const bodyChildren = children.find(
    (child: React.ReactElement) => child.type === 'body'
  )?.props?.children

  // Scripts with beforeInteractive can be placed inside Head or <body> so children of both needs to be traversed
  const combinedChildren = [
    ...(Array.isArray(headChildren) ? headChildren : [headChildren]),
    ...(Array.isArray(bodyChildren) ? bodyChildren : [bodyChildren]),
  ]

  React.Children.forEach(combinedChildren, (child: any) => {
    if (!child) return

    // When using the `next/script` component, register it in script loader.
    if (child.type?.__nextScript) {
      if (child.props.strategy === 'beforeInteractive') {
        scriptLoader.beforeInteractive = (
          scriptLoader.beforeInteractive || []
        ).concat([
          {
            ...child.props,
          },
        ])
        return
      } else if (
        ['lazyOnload', 'afterInteractive', 'worker'].includes(
          child.props.strategy
        )
      ) {
        scriptLoaderItems.push(child.props)
        return
      }
    }
  })

  __NEXT_DATA__.scriptLoader = scriptLoaderItems
}

export class NextScript extends React.Component<OriginProps> {
  static contextType = HtmlContext

  context!: HtmlProps

  getDynamicChunks(files: DocumentFiles) {
    return getDynamicChunks(this.context, this.props, files)
  }

  getPreNextScripts() {
    return getPreNextScripts(this.context, this.props)
  }

  getScripts(files: DocumentFiles) {
    return getScripts(this.context, this.props, files)
  }

  getPolyfillScripts() {
    return getPolyfillScripts(this.context, this.props)
  }

  static getInlineScriptSource(context: Readonly<HtmlProps>): string {
    const { __NEXT_DATA__, largePageDataBytes } = context
    try {
      const data = JSON.stringify(__NEXT_DATA__)

      if (largePageDataWarnings.has(__NEXT_DATA__.page)) {
        return htmlEscapeJsonString(data)
      }

      const bytes =
        process.env.NEXT_RUNTIME === 'edge'
          ? new TextEncoder().encode(data).buffer.byteLength
          : Buffer.from(data).byteLength
      const prettyBytes = require('../lib/pretty-bytes').default

      if (largePageDataBytes && bytes > largePageDataBytes) {
        if (process.env.NODE_ENV === 'production') {
          largePageDataWarnings.add(__NEXT_DATA__.page)
        }

        console.warn(
          `Warning: data for page "${__NEXT_DATA__.page}"${
            __NEXT_DATA__.page === context.dangerousAsPath
              ? ''
              : ` (path "${context.dangerousAsPath}")`
          } is ${prettyBytes(
            bytes
          )} which exceeds the threshold of ${prettyBytes(
            largePageDataBytes
          )}, this amount of data can reduce performance.\nSee more info here: https://nextjs.org/docs/messages/large-page-data`
        )
      }

      return htmlEscapeJsonString(data)
    } catch (err) {
      if (isError(err) && err.message.indexOf('circular structure') !== -1) {
        throw new Error(
          `Circular structure in "getInitialProps" result of page "${__NEXT_DATA__.page}". https://nextjs.org/docs/messages/circular-structure`
        )
      }
      throw err
    }
  }

  render() {
    const {
      assetPrefix,
      inAmpMode,
      buildManifest,
      unstable_runtimeJS,
      docComponentsRendered,
      assetQueryString,
      disableOptimizedLoading,
      crossOrigin,
    } = this.context
    const disableRuntimeJS = unstable_runtimeJS === false

    docComponentsRendered.NextScript = true

    if (process.env.NEXT_RUNTIME !== 'edge' && inAmpMode) {
      if (process.env.NODE_ENV === 'production') {
        return null
      }
      const ampDevFiles = [
        ...buildManifest.devFiles,
        ...buildManifest.polyfillFiles,
        ...buildManifest.ampDevFiles,
      ]

      return (
        <>
          {disableRuntimeJS ? null : (
            <script
              id="__NEXT_DATA__"
              type="application/json"
              nonce={this.props.nonce}
              crossOrigin={this.props.crossOrigin || crossOrigin}
              dangerouslySetInnerHTML={{
                __html: NextScript.getInlineScriptSource(this.context),
              }}
              data-ampdevmode
            />
          )}
          {ampDevFiles.map((file) => (
            <script
              key={file}
              src={`${assetPrefix}/_next/${file}${assetQueryString}`}
              nonce={this.props.nonce}
              crossOrigin={this.props.crossOrigin || crossOrigin}
              data-ampdevmode
            />
          ))}
        </>
      )
    }

    if (process.env.NODE_ENV !== 'production') {
      if (this.props.crossOrigin)
        console.warn(
          'Warning: `NextScript` attribute `crossOrigin` is deprecated. https://nextjs.org/docs/messages/doc-crossorigin-deprecated'
        )
    }

    const files: DocumentFiles = getDocumentFiles(
      this.context.buildManifest,
      this.context.__NEXT_DATA__.page,
      process.env.NEXT_RUNTIME !== 'edge' && inAmpMode
    )

    return (
      <>
        {!disableRuntimeJS && buildManifest.devFiles
          ? buildManifest.devFiles.map((file: string) => (
              <script
                key={file}
                src={`${assetPrefix}/_next/${encodeURI(
                  file
                )}${assetQueryString}`}
                nonce={this.props.nonce}
                crossOrigin={this.props.crossOrigin || crossOrigin}
              />
            ))
          : null}
        {disableRuntimeJS ? null : (
          <script
            id="__NEXT_DATA__"
            type="application/json"
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || crossOrigin}
            dangerouslySetInnerHTML={{
              __html: NextScript.getInlineScriptSource(this.context),
            }}
          />
        )}
        {disableOptimizedLoading &&
          !disableRuntimeJS &&
          this.getPolyfillScripts()}
        {disableOptimizedLoading &&
          !disableRuntimeJS &&
          this.getPreNextScripts()}
        {disableOptimizedLoading &&
          !disableRuntimeJS &&
          this.getDynamicChunks(files)}
        {disableOptimizedLoading && !disableRuntimeJS && this.getScripts(files)}
      </>
    )
  }
}

export function Html(
  props: React.DetailedHTMLProps<
    React.HtmlHTMLAttributes<HTMLHtmlElement>,
    HTMLHtmlElement
  >
) {
  const {
    inAmpMode,
    docComponentsRendered,
    locale,
    scriptLoader,
    __NEXT_DATA__,
  } = useHtmlContext()

  docComponentsRendered.Html = true
  handleDocumentScriptLoaderItems(scriptLoader, __NEXT_DATA__, props)

  return (
    <html
      {...props}
      lang={props.lang || locale || undefined}
      amp={process.env.NEXT_RUNTIME !== 'edge' && inAmpMode ? '' : undefined}
      data-ampdevmode={
        process.env.NEXT_RUNTIME !== 'edge' &&
        inAmpMode &&
        process.env.NODE_ENV !== 'production'
          ? ''
          : undefined
      }
    />
  )
}

export function Main() {
  const { docComponentsRendered } = useHtmlContext()
  docComponentsRendered.Main = true
  // @ts-ignore
  return <next-js-internal-body-render-target />
}

/**
 * `Document` component handles the initial `document` markup and renders only on the server side.
 * Commonly used for implementing server side rendering for `css-in-js` libraries.
 */
export default class Document<P = {}> extends React.Component<
  DocumentProps & P
> {
  /**
   * `getInitialProps` hook returns the context object with the addition of `renderPage`.
   * `renderPage` callback executes `React` rendering logic synchronously to support server-rendering wrappers
   */
  static getInitialProps(ctx: DocumentContext): Promise<DocumentInitialProps> {
    return ctx.defaultGetInitialProps(ctx)
  }

  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

// Add a special property to the built-in `Document` component so later we can
// identify if a user customized `Document` is used or not.
const InternalFunctionDocument: DocumentType =
  function InternalFunctionDocument() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
;(Document as any)[NEXT_BUILTIN_DOCUMENT] = InternalFunctionDocument
