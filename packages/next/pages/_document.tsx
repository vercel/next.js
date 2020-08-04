import PropTypes from 'prop-types'
import React, { useContext, Component, ReactNode } from 'react'
import flush from 'styled-jsx/server'
import {
  AMP_RENDER_TARGET,
  OPTIMIZED_FONT_PROVIDERS,
} from '../next-server/lib/constants'
import { DocumentContext as DocumentComponentContext } from '../next-server/lib/document-context'
import {
  DocumentContext,
  DocumentInitialProps,
  DocumentProps,
} from '../next-server/lib/utils'
import { cleanAmpPath } from '../next-server/server/utils'
import { htmlEscapeJsonString } from '../server/htmlescape'

export { DocumentContext, DocumentInitialProps, DocumentProps }

export type OriginProps = {
  nonce?: string
  crossOrigin?: string
}

function dedupe(bundles: any[]): any[] {
  const files = new Set()
  const kept = []

  for (const bundle of bundles) {
    if (files.has(bundle.file)) continue
    files.add(bundle.file)
    kept.push(bundle)
  }
  return kept
}

function getOptionalModernScriptVariant(path: string): string {
  if (process.env.__NEXT_MODERN_BUILD) {
    return path.replace(/\.js$/, '.module.js')
  }
  return path
}

/**
 * `Document` component handles the initial `document` markup and renders only on the server side.
 * Commonly used for implementing server side rendering for `css-in-js` libraries.
 */
export default class Document<P = {}> extends Component<DocumentProps & P> {
  static headTagsMiddleware = process.env.__NEXT_PLUGINS
    ? import(
        // @ts-ignore loader syntax
        'next-plugin-loader?middleware=document-head-tags-server!'
      )
    : () => []

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

  static renderDocument<P>(
    DocumentComponent: new () => Document<P>,
    props: DocumentProps & P
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
  const { inAmpMode } = useContext(DocumentComponentContext)
  return (
    <html
      {...props}
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

  getCssLinks(): JSX.Element[] | null {
    const { assetPrefix, files, devOnlyCacheBusterQueryString } = this.context
    const cssFiles =
      files && files.length ? files.filter((f) => f.endsWith('.css')) : []

    const cssLinkElements: JSX.Element[] = []
    cssFiles.forEach((file) => {
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
        />,
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
        />
      )
    })

    return cssLinkElements.length === 0 ? null : cssLinkElements
  }

  getPreloadDynamicChunks() {
    const {
      dynamicImports,
      assetPrefix,
      devOnlyCacheBusterQueryString,
    } = this.context

    return (
      dedupe(dynamicImports)
        .map((bundle: any) => {
          // `dynamicImports` will contain both `.js` and `.module.js` when the
          // feature is enabled. This clause will filter down to the modern
          // variants only.
          if (!bundle.file.endsWith(getOptionalModernScriptVariant('.js'))) {
            return null
          }

          return (
            <link
              rel="preload"
              key={bundle.file}
              href={`${assetPrefix}/_next/${encodeURI(
                bundle.file
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

  getPreloadMainLinks(): JSX.Element[] | null {
    const { assetPrefix, files, devOnlyCacheBusterQueryString } = this.context

    const preloadFiles =
      files && files.length
        ? files.filter((file: string) => {
            // `dynamicImports` will contain both `.js` and `.module.js` when
            // the feature is enabled. This clause will filter down to the
            // modern variants only.
            return file.endsWith(getOptionalModernScriptVariant('.js'))
          })
        : []

    return !preloadFiles.length
      ? null
      : preloadFiles.map((file: string) => (
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
        ))
  }

  makeStylesheetInert(node: ReactNode): ReactNode {
    return React.Children.map(node, (c: any) => {
      if (
        c.type === 'link' &&
        c.props['href'] &&
        OPTIMIZED_FONT_PROVIDERS.some((url) => c.props['href'].startsWith(url))
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
    } = this.context
    const disableRuntimeJS = unstable_runtimeJS === false

    let { head } = this.context
    let children = this.props.children
    // show a warning if Head contains <title> (only in development)
    if (process.env.NODE_ENV !== 'production') {
      children = React.Children.map(children, (child: any) => {
        const isReactHelmet = child?.props?.['data-react-helmet']
        if (!isReactHelmet) {
          if (child?.type === 'title') {
            console.warn(
              "Warning: <title> should not be used in _document.js's <Head>. https://err.sh/next.js/no-document-title"
            )
          } else if (
            child?.type === 'meta' &&
            child?.props?.name === 'viewport'
          ) {
            console.warn(
              "Warning: viewport meta tags should not be used in _document.js's <Head>. https://err.sh/next.js/no-document-viewport-meta"
            )
          }
        }
        return child
      })
      if (this.props.crossOrigin)
        console.warn(
          'Warning: `Head` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated'
        )
    }

    if (process.env.__NEXT_OPTIMIZE_FONTS) {
      children = this.makeStylesheetInert(children)
    }

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
            `Found conflicting amp tag "${child.type}" with conflicting prop ${badProp} in ${__NEXT_DATA__.page}. https://err.sh/next.js/conflicting-amp-tag`
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
            {process.env.__NEXT_OPTIMIZE_FONTS
              ? this.makeStylesheetInert(this.getCssLinks())
              : this.getCssLinks()}
            {!disableRuntimeJS && this.getPreloadDynamicChunks()}
            {!disableRuntimeJS && this.getPreloadMainLinks()}
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
  const { inAmpMode, html } = useContext(DocumentComponentContext)
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

  getDynamicChunks() {
    const {
      dynamicImports,
      assetPrefix,
      files,
      isDevelopment,
      devOnlyCacheBusterQueryString,
    } = this.context

    return dedupe(dynamicImports).map((bundle: any) => {
      let modernProps = {}
      if (process.env.__NEXT_MODERN_BUILD) {
        modernProps = bundle.file.endsWith('.module.js')
          ? { type: 'module' }
          : { noModule: true }
      }

      if (!bundle.file.endsWith('.js') || files.includes(bundle.file))
        return null

      return (
        <script
          async={!isDevelopment}
          key={bundle.file}
          src={`${assetPrefix}/_next/${encodeURI(
            bundle.file
          )}${devOnlyCacheBusterQueryString}`}
          nonce={this.props.nonce}
          crossOrigin={
            this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
          }
          {...modernProps}
        />
      )
    })
  }

  getScripts() {
    const {
      assetPrefix,
      files,
      buildManifest,
      isDevelopment,
      devOnlyCacheBusterQueryString,
    } = this.context

    const normalScripts = files?.filter((file) => file.endsWith('.js'))
    const lowPriorityScripts = buildManifest.lowPriorityFiles?.filter((file) =>
      file.endsWith('.js')
    )

    return [...normalScripts, ...lowPriorityScripts].map((file) => {
      let modernProps = {}
      if (process.env.__NEXT_MODERN_BUILD) {
        modernProps = file.endsWith('.module.js')
          ? { type: 'module' }
          : { noModule: true }
      }
      return (
        <script
          key={file}
          src={`${assetPrefix}/_next/${encodeURI(
            file
          )}${devOnlyCacheBusterQueryString}`}
          nonce={this.props.nonce}
          async={!isDevelopment}
          crossOrigin={
            this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
          }
          {...modernProps}
        />
      )
    })
  }

  getPolyfillScripts() {
    // polyfills.js has to be rendered as nomodule without async
    // It also has to be the first script to load
    const {
      assetPrefix,
      buildManifest,
      devOnlyCacheBusterQueryString,
    } = this.context

    return buildManifest.polyfillFiles
      .filter(
        (polyfill) =>
          polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
      )
      .map((polyfill) => (
        <script
          key={polyfill}
          nonce={this.props.nonce}
          crossOrigin={
            this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
          }
          noModule={true}
          src={`${assetPrefix}/_next/${polyfill}${devOnlyCacheBusterQueryString}`}
        />
      ))
  }

  static getInlineScriptSource(documentProps: DocumentProps): string {
    const { __NEXT_DATA__ } = documentProps
    try {
      const data = JSON.stringify(__NEXT_DATA__)
      return htmlEscapeJsonString(data)
    } catch (err) {
      if (err.message.indexOf('circular structure')) {
        throw new Error(
          `Circular structure in "getInitialProps" result of page "${__NEXT_DATA__.page}". https://err.sh/vercel/next.js/circular-structure`
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
      devOnlyCacheBusterQueryString,
    } = this.context
    const disableRuntimeJS = unstable_runtimeJS === false

    if (inAmpMode) {
      if (process.env.NODE_ENV === 'production') {
        return null
      }

      const ampDevFiles = [
        ...buildManifest.devFiles,
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
          'Warning: `NextScript` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated'
        )
    }

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
        {process.env.__NEXT_MODERN_BUILD && !disableRuntimeJS ? (
          <script
            nonce={this.props.nonce}
            crossOrigin={
              this.props.crossOrigin || process.env.__NEXT_CROSS_ORIGIN
            }
            noModule={true}
            dangerouslySetInnerHTML={{
              __html: NextScript.safariNomoduleFix,
            }}
          />
        ) : null}
        {!disableRuntimeJS && this.getPolyfillScripts()}
        {disableRuntimeJS ? null : this.getDynamicChunks()}
        {disableRuntimeJS ? null : this.getScripts()}
      </>
    )
  }
}

function getAmpPath(ampPath: string, asPath: string): string {
  return ampPath || `${asPath}${asPath.includes('?') ? '&' : '?'}amp=1`
}
