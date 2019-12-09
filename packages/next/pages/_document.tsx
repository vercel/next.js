import PropTypes from 'prop-types'
import React, { Component } from 'react'
import flush from 'styled-jsx/server'

import {
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
  AMP_RENDER_TARGET,
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

export async function middleware({ req, res }: DocumentContext) {}

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

function getOptionalModernScriptVariant(path: string) {
  if (process.env.__NEXT_MODERN_BUILD) {
    return path.replace(/\.js$/, '.module.js')
  }
  return path
}

function isLowPriority(file: string) {
  return file.includes('_buildManifest')
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
  static bodyTagsMiddleware = process.env.__NEXT_PLUGINS
    ? import(
        // @ts-ignore loader syntax
        'next-plugin-loader?middleware=document-body-tags-server!'
      )
    : () => []
  static htmlPropsMiddleware = process.env.__NEXT_PLUGINS
    ? import(
        // @ts-ignore loader syntax
        'next-plugin-loader?middleware=document-html-props-server!'
      )
    : () => []

  /**
   * `getInitialProps` hook returns the context object with the addition of `renderPage`.
   * `renderPage` callback executes `React` rendering logic synchronously to support server-rendering wrappers
   */
  static async getInitialProps(
    ctx: DocumentContext
  ): Promise<DocumentInitialProps> {
    const enhancers = process.env.__NEXT_PLUGINS
      ? await import(
          // @ts-ignore loader syntax
          'next-plugin-loader?middleware=unstable-enhance-app-server!'
        ).then(mod => mod.default(ctx))
      : []

    const enhanceApp = (App: any) => {
      for (const enhancer of enhancers) {
        App = enhancer(App)
      }
      return (props: any) => <App {...props} />
    }

    const { html, head, dataOnly } = await ctx.renderPage({ enhanceApp })
    const styles = [
      ...flush(),
      ...(process.env.__NEXT_PLUGINS
        ? await import(
            // @ts-ignore loader syntax
            'next-plugin-loader?middleware=unstable-get-styles-server!'
          ).then(mod => mod.default(ctx))
        : []),
    ]
    return { html, head, styles, dataOnly }
  }

  static renderDocument<P>(
    Document: new () => Document<P>,
    props: DocumentProps & P
  ): React.ReactElement {
    return (
      <DocumentComponentContext.Provider
        value={{
          _documentProps: props,
          // In dev we invalidate the cache by appending a timestamp to the resource URL.
          // This is a workaround to fix https://github.com/zeit/next.js/issues/5860
          // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
          _devOnlyInvalidateCacheQueryString:
            process.env.NODE_ENV !== 'production' ? '?ts=' + Date.now() : '',
        }}
      >
        <Document {...props} />
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

export class Html extends Component<
  React.DetailedHTMLProps<
    React.HtmlHTMLAttributes<HTMLHtmlElement>,
    HTMLHtmlElement
  >
> {
  static contextType = DocumentComponentContext

  static propTypes = {
    children: PropTypes.node.isRequired,
  }

  context!: React.ContextType<typeof DocumentComponentContext>

  render() {
    const { inAmpMode, htmlProps } = this.context._documentProps
    return (
      <html
        {...htmlProps}
        {...this.props}
        amp={inAmpMode ? '' : undefined}
        data-ampdevmode={
          inAmpMode && process.env.NODE_ENV !== 'production' ? '' : undefined
        }
      />
    )
  }
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
    const { assetPrefix, files } = this.context._documentProps
    const cssFiles =
      files && files.length ? files.filter(f => /\.css$/.test(f)) : []

    const cssLinkElements: JSX.Element[] = []
    cssFiles.forEach(file => {
      cssLinkElements.push(
        <link
          key={`${file}-preload`}
          nonce={this.props.nonce}
          rel="preload"
          href={`${assetPrefix}/_next/${encodeURI(file)}`}
          as="style"
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
        />,
        <link
          key={file}
          nonce={this.props.nonce}
          rel="stylesheet"
          href={`${assetPrefix}/_next/${encodeURI(file)}`}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
        />
      )
    })

    return cssLinkElements.length === 0 ? null : cssLinkElements
  }

  getPreloadDynamicChunks() {
    const { dynamicImports, assetPrefix } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

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
              )}${_devOnlyInvalidateCacheQueryString}`}
              as="script"
              nonce={this.props.nonce}
              crossOrigin={this.props.crossOrigin || process.crossOrigin}
            />
          )
        })
        // Filter out nulled scripts
        .filter(Boolean)
    )
  }

  getPreloadMainLinks(): JSX.Element[] | null {
    const { assetPrefix, files } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

    const preloadFiles =
      files && files.length
        ? files.filter((file: string) => {
            // `dynamicImports` will contain both `.js` and `.module.js` when
            // the feature is enabled. This clause will filter down to the
            // modern variants only.
            //
            // Also filter out low priority files because they should not be
            // preloaded for performance reasons.
            return (
              file.endsWith(getOptionalModernScriptVariant('.js')) &&
              !isLowPriority(file)
            )
          })
        : []

    return preloadFiles.length === 0
      ? null
      : preloadFiles.map((file: string) => {
          return (
            <link
              key={file}
              nonce={this.props.nonce}
              rel="preload"
              href={`${assetPrefix}/_next/${encodeURI(
                file
              )}${_devOnlyInvalidateCacheQueryString}`}
              as="script"
              crossOrigin={this.props.crossOrigin || process.crossOrigin}
            />
          )
        })
  }

  render() {
    const {
      styles,
      ampPath,
      inAmpMode,
      assetPrefix,
      hybridAmp,
      canonicalBase,
      __NEXT_DATA__,
      dangerousAsPath,
      headTags,
    } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context
    const { page, buildId } = __NEXT_DATA__

    let { head } = this.context._documentProps
    let children = this.props.children
    // show a warning if Head contains <title> (only in development)
    if (process.env.NODE_ENV !== 'production') {
      children = React.Children.map(children, (child: any) => {
        const isReactHelmet =
          child && child.props && child.props['data-react-helmet']
        if (child && child.type === 'title' && !isReactHelmet) {
          console.warn(
            "Warning: <title> should not be used in _document.js's <Head>. https://err.sh/next.js/no-document-title"
          )
        }
        return child
      })
      if (this.props.crossOrigin)
        console.warn(
          'Warning: `Head` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated'
        )
    }

    let hasAmphtmlRel = false
    let hasCanonicalRel = false

    // show warning and remove conflicting amp head tags
    head = React.Children.map(head || [], child => {
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
            Object.keys(props).forEach(prop => {
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
        el &&
        el.props &&
        el.props.dangerouslySetInnerHTML &&
        el.props.dangerouslySetInnerHTML.__html
      // @ts-ignore Property 'props' does not exist on type ReactElement
      styles.props.children.forEach((child: React.ReactElement) => {
        if (Array.isArray(child)) {
          child.map(el => hasStyles(el) && curStyles.push(el))
        } else if (hasStyles(child)) {
          curStyles.push(child)
        }
      })
    }

    return (
      <head {...this.props}>
        {this.context._documentProps.isDevelopment &&
          this.context._documentProps.hasCssMode && (
            <>
              <style
                data-next-hide-fouc
                dangerouslySetInnerHTML={{
                  __html: `body{display:none}`,
                }}
              />
              <noscript data-next-hide-fouc>
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
                    .map(style => style.props.dangerouslySetInnerHTML.__html)
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
            {this.getCssLinks()}
            {page !== '/_error' && (
              <link
                rel="preload"
                href={
                  assetPrefix +
                  getOptionalModernScriptVariant(
                    encodeURI(
                      `/_next/static/${buildId}/pages${getPageFile(page)}`
                    )
                  ) +
                  _devOnlyInvalidateCacheQueryString
                }
                as="script"
                nonce={this.props.nonce}
                crossOrigin={this.props.crossOrigin || process.crossOrigin}
              />
            )}
            <link
              rel="preload"
              href={
                assetPrefix +
                getOptionalModernScriptVariant(
                  encodeURI(`/_next/static/${buildId}/pages/_app.js`)
                ) +
                _devOnlyInvalidateCacheQueryString
              }
              as="script"
              nonce={this.props.nonce}
              crossOrigin={this.props.crossOrigin || process.crossOrigin}
            />
            {this.getPreloadDynamicChunks()}
            {this.getPreloadMainLinks()}
            {this.context._documentProps.isDevelopment &&
              this.context._documentProps.hasCssMode && (
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

export class Main extends Component {
  static contextType = DocumentComponentContext

  context!: React.ContextType<typeof DocumentComponentContext>

  render() {
    const { inAmpMode, html } = this.context._documentProps
    if (inAmpMode) return AMP_RENDER_TARGET
    return <div id="__next" dangerouslySetInnerHTML={{ __html: html }} />
  }
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
    const { dynamicImports, assetPrefix, files } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return dedupe(dynamicImports).map((bundle: any) => {
      let modernProps = {}
      if (process.env.__NEXT_MODERN_BUILD) {
        modernProps = /\.module\.js$/.test(bundle.file)
          ? { type: 'module' }
          : { noModule: true }
      }

      if (!/\.js$/.test(bundle.file) || files.includes(bundle.file)) return null

      return (
        <script
          defer={process.env.__NEXT_DEFER_SCRIPTS as any}
          async={!process.env.__NEXT_DEFER_SCRIPTS as any}
          key={bundle.file}
          src={`${assetPrefix}/_next/${encodeURI(
            bundle.file
          )}${_devOnlyInvalidateCacheQueryString}`}
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          {...modernProps}
        />
      )
    })
  }

  getScripts() {
    const { assetPrefix, files } = this.context._documentProps
    if (!files || files.length === 0) {
      return null
    }
    const { _devOnlyInvalidateCacheQueryString } = this.context

    const normalScripts = files.filter(
      file => file.endsWith('.js') && !isLowPriority(file)
    )
    const lowPriorityScripts = files.filter(
      file => file.endsWith('.js') && isLowPriority(file)
    )

    return [...normalScripts, ...lowPriorityScripts].map(file => {
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
          )}${_devOnlyInvalidateCacheQueryString}`}
          nonce={this.props.nonce}
          defer={process.env.__NEXT_DEFER_SCRIPTS as any}
          async={!process.env.__NEXT_DEFER_SCRIPTS as any}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          {...modernProps}
        />
      )
    })
  }

  getPolyfillScripts() {
    // polyfills.js has to be rendered as nomodule without async
    // It also has to be the first script to load
    const { assetPrefix, polyfillFiles } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return polyfillFiles
      .filter(
        polyfill => polyfill.endsWith('.js') && !/\.module\.js$/.test(polyfill)
      )
      .map(polyfill => (
        <script
          key={polyfill}
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          noModule={true}
          src={`${assetPrefix}/_next/${polyfill}${_devOnlyInvalidateCacheQueryString}`}
        />
      ))
  }

  static getInlineScriptSource(documentProps: DocumentProps) {
    const { __NEXT_DATA__ } = documentProps
    try {
      const data = JSON.stringify(__NEXT_DATA__)
      return htmlEscapeJsonString(data)
    } catch (err) {
      if (err.message.indexOf('circular structure')) {
        throw new Error(
          `Circular structure in "getInitialProps" result of page "${__NEXT_DATA__.page}". https://err.sh/zeit/next.js/circular-structure`
        )
      }
      throw err
    }
  }

  render() {
    const {
      staticMarkup,
      assetPrefix,
      inAmpMode,
      devFiles,
      __NEXT_DATA__,
      bodyTags,
    } = this.context._documentProps
    const deferScripts: any = process.env.__NEXT_DEFER_SCRIPTS
    const { _devOnlyInvalidateCacheQueryString } = this.context

    if (inAmpMode) {
      if (process.env.NODE_ENV === 'production') {
        return null
      }

      const devFiles = [
        CLIENT_STATIC_FILES_RUNTIME_AMP,
        CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
      ]

      return (
        <>
          {staticMarkup ? null : (
            <script
              id="__NEXT_DATA__"
              type="application/json"
              nonce={this.props.nonce}
              crossOrigin={this.props.crossOrigin || process.crossOrigin}
              dangerouslySetInnerHTML={{
                __html: NextScript.getInlineScriptSource(
                  this.context._documentProps
                ),
              }}
              data-ampdevmode
            />
          )}
          {devFiles
            ? devFiles.map(file => (
                <script
                  key={file}
                  src={`${assetPrefix}/_next/${file}${_devOnlyInvalidateCacheQueryString}`}
                  nonce={this.props.nonce}
                  crossOrigin={this.props.crossOrigin || process.crossOrigin}
                  data-ampdevmode
                />
              ))
            : null}
          {React.createElement(React.Fragment, {}, ...(bodyTags || []))}
        </>
      )
    }

    const { page, buildId } = __NEXT_DATA__

    if (process.env.NODE_ENV !== 'production') {
      if (this.props.crossOrigin)
        console.warn(
          'Warning: `NextScript` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated'
        )
    }

    const pageScript = [
      <script
        defer={deferScripts}
        async={!deferScripts}
        data-next-page={page}
        key={page}
        src={
          assetPrefix +
          encodeURI(`/_next/static/${buildId}/pages${getPageFile(page)}`) +
          _devOnlyInvalidateCacheQueryString
        }
        nonce={this.props.nonce}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
        {...(process.env.__NEXT_MODERN_BUILD ? { noModule: true } : {})}
      />,
      process.env.__NEXT_MODERN_BUILD && (
        <script
          defer={deferScripts}
          async={!deferScripts}
          data-next-page={page}
          key={`${page}-modern`}
          src={
            assetPrefix +
            getOptionalModernScriptVariant(
              encodeURI(`/_next/static/${buildId}/pages${getPageFile(page)}`)
            ) +
            _devOnlyInvalidateCacheQueryString
          }
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          type="module"
        />
      ),
    ]

    const appScript = [
      <script
        defer={deferScripts}
        async={!deferScripts}
        data-next-page="/_app"
        src={
          assetPrefix +
          `/_next/static/${buildId}/pages/_app.js` +
          _devOnlyInvalidateCacheQueryString
        }
        key="_app"
        nonce={this.props.nonce}
        crossOrigin={this.props.crossOrigin || process.crossOrigin}
        {...(process.env.__NEXT_MODERN_BUILD ? { noModule: true } : {})}
      />,
      process.env.__NEXT_MODERN_BUILD && (
        <script
          defer={deferScripts}
          async={!deferScripts}
          data-next-page="/_app"
          src={
            assetPrefix +
            `/_next/static/${buildId}/pages/_app.module.js` +
            _devOnlyInvalidateCacheQueryString
          }
          key="_app-modern"
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
          type="module"
        />
      ),
    ]

    return (
      <>
        {devFiles
          ? devFiles.map(
              (file: string) =>
                !file.match(/\.js\.map/) && (
                  <script
                    key={file}
                    src={`${assetPrefix}/_next/${encodeURI(
                      file
                    )}${_devOnlyInvalidateCacheQueryString}`}
                    nonce={this.props.nonce}
                    crossOrigin={this.props.crossOrigin || process.crossOrigin}
                  />
                )
            )
          : null}
        {staticMarkup ? null : (
          <script
            id="__NEXT_DATA__"
            type="application/json"
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
            dangerouslySetInnerHTML={{
              __html: NextScript.getInlineScriptSource(
                this.context._documentProps
              ),
            }}
          />
        )}
        {process.env.__NEXT_MODERN_BUILD ? (
          <script
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
            noModule={true}
            dangerouslySetInnerHTML={{
              __html: NextScript.safariNomoduleFix,
            }}
          />
        ) : null}
        {this.getPolyfillScripts()}
        {page !== '/_error' && pageScript}
        {appScript}
        {staticMarkup ? null : this.getDynamicChunks()}
        {staticMarkup ? null : this.getScripts()}
        {React.createElement(React.Fragment, {}, ...(bodyTags || []))}
      </>
    )
  }
}

function getAmpPath(ampPath: string, asPath: string) {
  return ampPath ? ampPath : `${asPath}${asPath.includes('?') ? '&' : '?'}amp=1`
}

function getPageFile(page: string, buildId?: string) {
  if (page === '/') {
    return buildId ? `/index.${buildId}.js` : '/index.js'
  }

  return buildId ? `${page}.${buildId}.js` : `${page}.js`
}
