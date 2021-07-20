import PropTypes from 'prop-types'
import React, { Component, ReactElement, ReactNode, useContext } from 'react'
import flush from 'styled-jsx/server'
import {
  AMP_RENDER_TARGET,
  OPTIMIZED_FONT_PROVIDERS,
} from '../shared/lib/constants'
import { DocumentContext as DocumentComponentContext } from '../shared/lib/document-context'
import {
  DocumentContext,
  DocumentInitialProps,
  DocumentProps,
} from '../shared/lib/utils'
import { BuildManifest, getPageFiles } from '../server/get-page-files'
import { cleanAmpPath } from '../server/utils'
import { htmlEscapeJsonString } from '../server/htmlescape'
import Script, { ScriptProps } from '../client/script'

export { DocumentContext, DocumentInitialProps, DocumentProps }

export type OriginProps = {
  nonce?: string
  crossOrigin?: string
}

type DocumentFiles = {
  sharedFiles: readonly string[]
  pageFiles: readonly string[]
  allFiles: readonly string[]
}

function getDocumentFiles(
  buildManifest: BuildManifest,
  pathname: string,
  inAmpMode: boolean
): DocumentFiles {
  const sharedFiles: readonly string[] = getPageFiles(buildManifest, '/_app')
  const pageFiles: readonly string[] = inAmpMode
    ? []
    : getPageFiles(buildManifest, pathname)

  return {
    sharedFiles,
    pageFiles,
    allFiles: [...new Set([...sharedFiles, ...pageFiles])],
  }
}

function getPolyfillScripts(context: DocumentProps, props: OriginProps) {
  // polyfills.js has to be rendered as nomodule without async
  // It also has to be the first script to load
  const {
    assetPrefix,
    buildManifest,
    devOnlyCacheBusterQueryString,
    disableOptimizedLoading,
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
        crossOrigin={props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN}
        noModule={true}
        src={`${assetPrefix}/_next/${polyfill}${devOnlyCacheBusterQueryString}`}
      />
    ))
}

function getPreNextScripts(context: DocumentProps, props: OriginProps) {
  const { scriptLoader, disableOptimizedLoading } = context

  return (scriptLoader.beforeInteractive || []).map(
    (file: ScriptProps, index: number) => {
      const { strategy, ...scriptProps } = file
      return (
        <script
          {...scriptProps}
          key={scriptProps.src || index}
          defer={!disableOptimizedLoading}
          nonce={props.nonce}
          crossOrigin={props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN}
        />
      )
    }
  )
}

function getDynamicChunks(
  context: DocumentProps,
  props: OriginProps,
  files: DocumentFiles
) {
  const {
    dynamicImports,
    assetPrefix,
    isDevelopment,
    devOnlyCacheBusterQueryString,
    disableOptimizedLoading,
  } = context

  return dynamicImports.map((file) => {
    if (!file.endsWith('.js') || files.allFiles.includes(file)) return null

    return (
      <script
        async={!isDevelopment && disableOptimizedLoading}
        defer={!disableOptimizedLoading}
        key={file}
        src={`${assetPrefix}/_next/${encodeURI(
          file
        )}${devOnlyCacheBusterQueryString}`}
        nonce={props.nonce}
        crossOrigin={props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN}
      />
    )
  })
}

function getScripts(
  context: DocumentProps,
  props: OriginProps,
  files: DocumentFiles
) {
  const {
    assetPrefix,
    buildManifest,
    isDevelopment,
    devOnlyCacheBusterQueryString,
    disableOptimizedLoading,
  } = context

  const normalScripts = files.allFiles.filter((file) => file.endsWith('.js'))
  const lowPriorityScripts = buildManifest.lowPriorityFiles?.filter((file) =>
    file.endsWith('.js')
  )

  return [...normalScripts, ...lowPriorityScripts].map((file) => {
    return (
      <script
        key={file}
        src={`${assetPrefix}/_next/${encodeURI(
          file
        )}${devOnlyCacheBusterQueryString}`}
        nonce={props.nonce}
        async={!isDevelopment && disableOptimizedLoading}
        defer={!disableOptimizedLoading}
        crossOrigin={props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN}
      />
    )
  })
}

/**
 * `Document` component handles the initial `document` markup and renders only on the server side.
 * Commonly used for implementing server side rendering for `css-in-js` libraries.
 */
export default class Document<P = {}> extends Component<DocumentProps & P> {
  /**
   * `getInitialProps` hook returns the context object with the addition of `renderPage`.
   * `renderPage` callback executes `React` rendering logic synchronously to support server-rendering wrappers
   */
  static async getInitialProps(
    ctx: DocumentContext
  ): Promise<DocumentInitialProps> {
    const enhanceApp = (App: any) => {
      return (props: any) => <App {...props} />
    }

    const { html, head } = await ctx.renderPage({ enhanceApp })
    const styles = [...flush()]
    return { html, head, styles }
  }

  static renderDocument<Y>(
    DocumentComponent: new () => Document<Y>,
    props: DocumentProps & Y
  ): React.ReactElement {
    return (
      <DocumentComponentContext.Provider value={props}>
        <DocumentComponent {...props} />
      </DocumentComponentContext.Provider>
    )
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

export function Html(
  props: React.DetailedHTMLProps<
    React.HtmlHTMLAttributes<HTMLHtmlElement>,
    HTMLHtmlElement
  >
) {
  const { inAmpMode, docComponentsRendered, locale } = useContext(
    DocumentComponentContext
  )

  docComponentsRendered.Html = true

  return (
    <html
      {...props}
      lang={props.lang || locale || undefined}
      amp={inAmpMode ? '' : undefined}
      data-ampdevmode={
        inAmpMode && process.env.NODE_ENV !== 'production' ? '' : undefined
      }
    />
  )
}

export class Head extends Component<
  OriginProps &
    React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLHeadElement>,
      HTMLHeadElement
    >
> {
  static contextType = DocumentComponentContext

  static propTypes = {
    nonce: PropTypes.string,
    crossOrigin: PropTypes.string,
  }

  context!: React.ContextType<typeof DocumentComponentContext>

  getCssLinks(files: DocumentFiles): JSX.Element[] | null {
    const {
      assetPrefix,
      devOnlyCacheBusterQueryString,
      dynamicImports,
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

      if (!process.env.__NEXT_OPTIMIZE_CSS) {
        cssLinkElements.push(
          <link
            key={`${file}-preload`}
            nonce={this.props.nonce}
            rel="preload"
            href={`${assetPrefix}/_next/${encodeURI(
              file
            )}${devOnlyCacheBusterQueryString}`}
            as="style"
            crossOrigin={
              this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
            }
          />
        )
      }

      const isUnmanagedFile = unmangedFiles.has(file)
      cssLinkElements.push(
        <link
          key={file}
          nonce={this.props.nonce}
          rel="stylesheet"
          href={`${assetPrefix}/_next/${encodeURI(
            file
          )}${devOnlyCacheBusterQueryString}`}
          crossOrigin={
            this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
          }
          data-n-g={isUnmanagedFile ? undefined : isSharedFile ? '' : undefined}
          data-n-p={isUnmanagedFile ? undefined : isSharedFile ? undefined : ''}
        />
      )
    })

    if (
      process.env.NODE_ENV !== 'development' &&
      process.env.__NEXT_OPTIMIZE_FONTS
    ) {
      cssLinkElements = this.makeStylesheetInert(
        cssLinkElements
      ) as ReactElement[]
    }

    return cssLinkElements.length === 0 ? null : cssLinkElements
  }

  getPreloadDynamicChunks() {
    const {
      dynamicImports,
      assetPrefix,
      devOnlyCacheBusterQueryString,
    } = this.context

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
              )}${devOnlyCacheBusterQueryString}`}
              as="script"
              nonce={this.props.nonce}
              crossOrigin={
                this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
              }
            />
          )
        })
        // Filter out nulled scripts
        .filter(Boolean)
    )
  }

  getPreloadMainLinks(files: DocumentFiles): JSX.Element[] | null {
    const {
      assetPrefix,
      devOnlyCacheBusterQueryString,
      scriptLoader,
    } = this.context
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
          crossOrigin={
            this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
          }
        />
      )),
      ...preloadFiles.map((file: string) => (
        <link
          key={file}
          nonce={this.props.nonce}
          rel="preload"
          href={`${assetPrefix}/_next/${encodeURI(
            file
          )}${devOnlyCacheBusterQueryString}`}
          as="script"
          crossOrigin={
            this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
          }
        />
      )),
    ]
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

  handleDocumentScriptLoaderItems(children: React.ReactNode): ReactNode[] {
    const { scriptLoader } = this.context
    const scriptLoaderItems: ScriptProps[] = []
    const filteredChildren: ReactNode[] = []

    React.Children.forEach(children, (child: any) => {
      if (child.type === Script) {
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
          ['lazyOnload', 'afterInteractive'].includes(child.props.strategy)
        ) {
          scriptLoaderItems.push(child.props)
          return
        }
      }

      filteredChildren.push(child)
    })

    this.context.__NEXT_DATA__.scriptLoader = scriptLoaderItems

    return filteredChildren
  }

  makeStylesheetInert(node: ReactNode): ReactNode[] {
    return React.Children.map(node, (c: any) => {
      if (
        c.type === 'link' &&
        c.props['href'] &&
        OPTIMIZED_FONT_PROVIDERS.some(({ url }) =>
          c.props['href'].startsWith(url)
        )
      ) {
        const newProps = { ...(c.props || {}) }
        newProps['data-href'] = newProps['href']
        newProps['href'] = undefined
        return React.cloneElement(c, newProps)
      } else if (c.props && c.props['children']) {
        c.props['children'] = this.makeStylesheetInert(c.props['children'])
      }
      return c
    })
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
        if (
          c &&
          c.type === 'link' &&
          c.props['rel'] === 'preload' &&
          c.props['as'] === 'style'
        ) {
          cssPreloads.push(c)
        } else {
          c && otherHeadElements.push(c)
        }
      })
      head = cssPreloads.concat(otherHeadElements)
    }
    let children = React.Children.toArray(this.props.children).filter(Boolean)
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
      })
      if (this.props.crossOrigin)
        console.warn(
          'Warning: `Head` attribute `crossOrigin` is deprecated. https://nextjs.org/docs/messages/doc-crossorigin-deprecated'
        )
    }

    if (
      process.env.NODE_ENV !== 'development' &&
      process.env.__NEXT_OPTIMIZE_FONTS &&
      !inAmpMode
    ) {
      children = this.makeStylesheetInert(children)
    }

    children = this.handleDocumentScriptLoaderItems(children)

    let hasAmphtmlRel = false
    let hasCanonicalRel = false

    // show warning and remove conflicting amp head tags
    head = React.Children.map(head || [], (child) => {
      if (!child) return child
      const { type, props } = child
      if (inAmpMode) {
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
    })

    // try to parse styles from fragment for backwards compat
    const curStyles: React.ReactElement[] = Array.isArray(styles)
      ? (styles as React.ReactElement[])
      : []
    if (
      inAmpMode &&
      styles &&
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

    const files: DocumentFiles = getDocumentFiles(
      this.context.buildManifest,
      this.context.__NEXT_DATA__.page,
      inAmpMode
    )

    return (
      <head {...this.props}>
        {this.context.isDevelopment && (
          <>
            <style
              data-next-hide-fouc
              data-ampdevmode={inAmpMode ? 'true' : undefined}
              dangerouslySetInnerHTML={{
                __html: `body{display:none}`,
              }}
            />
            <noscript
              data-next-hide-fouc
              data-ampdevmode={inAmpMode ? 'true' : undefined}
            >
              <style
                dangerouslySetInnerHTML={{
                  __html: `body{display:block}`,
                }}
              />
            </noscript>
          </>
        )}
        {children}
        {process.env.__NEXT_OPTIMIZE_FONTS && (
          <meta name="next-font-preconnect" />
        )}
        {head}
        <meta
          name="next-head-count"
          content={React.Children.count(head || []).toString()}
        />
        {inAmpMode && (
          <>
            <meta
              name="viewport"
              content="width=device-width,minimum-scale=1,initial-scale=1"
            />
            {!hasCanonicalRel && (
              <link
                rel="canonical"
                href={canonicalBase + cleanAmpPath(dangerousAsPath)}
              />
            )}
            {/* https://www.ampproject.org/docs/fundamentals/optimize_amp#optimize-the-amp-runtime-loading */}
            <link
              rel="preload"
              as="script"
              href="https://cdn.ampproject.org/v0.js"
            />
            {/* Add custom styles before AMP styles to prevent accidental overrides */}
            {styles && (
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
            )}
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
        {!inAmpMode && (
          <>
            {!hasAmphtmlRel && hybridAmp && (
              <link
                rel="amphtml"
                href={canonicalBase + getAmpPath(ampPath, dangerousAsPath)}
              />
            )}
            {!process.env.__NEXT_OPTIMIZE_CSS && this.getCssLinks(files)}
            {!process.env.__NEXT_OPTIMIZE_CSS && (
              <noscript data-n-css={this.props.nonce ?? ''} />
            )}
            {process.env.__NEXT_OPTIMIZE_IMAGES && (
              <meta name="next-image-preload" />
            )}
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
            {process.env.__NEXT_OPTIMIZE_CSS && this.getCssLinks(files)}
            {process.env.__NEXT_OPTIMIZE_CSS && (
              <noscript data-n-css={this.props.nonce ?? ''} />
            )}
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

export function Main() {
  const { inAmpMode, html, docComponentsRendered } = useContext(
    DocumentComponentContext
  )

  docComponentsRendered.Main = true

  if (inAmpMode) return <>{AMP_RENDER_TARGET}</>
  return <div id="__next" dangerouslySetInnerHTML={{ __html: html }} />
}

export class NextScript extends Component<OriginProps> {
  static contextType = DocumentComponentContext

  static propTypes = {
    nonce: PropTypes.string,
    crossOrigin: PropTypes.string,
  }

  context!: React.ContextType<typeof DocumentComponentContext>

  // Source: https://gist.github.com/samthor/64b114e4a4f539915a95b91ffd340acc
  static safariNomoduleFix =
    '!function(){var e=document,t=e.createElement("script");if(!("noModule"in t)&&"onbeforeload"in t){var n=!1;e.addEventListener("beforeload",function(e){if(e.target===t)n=!0;else if(!e.target.hasAttribute("nomodule")||!n)return;e.preventDefault()},!0),t.type="module",t.src=".",e.head.appendChild(t),t.remove()}}();'

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

  static getInlineScriptSource(documentProps: Readonly<DocumentProps>): string {
    const { __NEXT_DATA__ } = documentProps
    try {
      const data = JSON.stringify(__NEXT_DATA__)
      return htmlEscapeJsonString(data)
    } catch (err) {
      if (err.message.indexOf('circular structure')) {
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
      devOnlyCacheBusterQueryString,
      disableOptimizedLoading,
    } = this.context
    const disableRuntimeJS = unstable_runtimeJS === false

    docComponentsRendered.NextScript = true

    if (inAmpMode) {
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
              crossOrigin={
                this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
              }
              dangerouslySetInnerHTML={{
                __html: NextScript.getInlineScriptSource(this.context),
              }}
              data-ampdevmode
            />
          )}
          {ampDevFiles.map((file) => (
            <script
              key={file}
              src={`${assetPrefix}/_next/${file}${devOnlyCacheBusterQueryString}`}
              nonce={this.props.nonce}
              crossOrigin={
                this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
              }
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
      inAmpMode
    )

    return (
      <>
        {!disableRuntimeJS && buildManifest.devFiles
          ? buildManifest.devFiles.map((file: string) => (
              <script
                key={file}
                src={`${assetPrefix}/_next/${encodeURI(
                  file
                )}${devOnlyCacheBusterQueryString}`}
                nonce={this.props.nonce}
                crossOrigin={
                  this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
                }
              />
            ))
          : null}
        {disableRuntimeJS ? null : (
          <script
            id="__NEXT_DATA__"
            type="application/json"
            nonce={this.props.nonce}
            crossOrigin={
              this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
            }
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

function getAmpPath(ampPath: string, asPath: string): string {
  return ampPath || `${asPath}${asPath.includes('?') ? '&' : '?'}amp=1`
}
