/* eslint-disable */
import PropTypes from 'prop-types'
import React, { Component } from 'react'
import { cleanAmpPath } from 'next-server/dist/server/utils'
import { DocumentContext, DocumentInitialProps, DocumentProps } from 'next-server/dist/lib/utils'
import { htmlEscapeJsonString } from '../server/htmlescape'
import flush from 'styled-jsx/server'
import {
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
} from 'next-server/constants'

export { DocumentContext, DocumentInitialProps, DocumentProps }

export type OriginProps = {
  nonce?: string
  crossOrigin?: string,
}

export type DocumentComponentContext = {
  readonly _documentProps: DocumentProps
  readonly _devOnlyInvalidateCacheQueryString: string,
}

export default class Document<P = {}> extends Component<DocumentProps & P> {
  static childContextTypes = {
    _documentProps: PropTypes.any,
    _devOnlyInvalidateCacheQueryString: PropTypes.string,
  }

  static async getInitialProps({ renderPage }: DocumentContext): Promise<DocumentInitialProps> {
    const { html, head, dataOnly } = await renderPage()
    const styles = flush()
    return { html, head, styles, dataOnly }
  }

  context!: DocumentComponentContext

  getChildContext(): DocumentComponentContext {
    return {
      _documentProps: this.props,
      // In dev we invalidate the cache by appending a timestamp to the resource URL.
      // This is a workaround to fix https://github.com/zeit/next.js/issues/5860
      // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
      _devOnlyInvalidateCacheQueryString:
        process.env.NODE_ENV !== 'production' ? '?ts=' + Date.now() : '',
    }
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

export class Html extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any,
  }

  static propTypes = {
    children: PropTypes.node.isRequired,
  }

  context!: DocumentComponentContext

  render() {
    const { amphtml } = this.context._documentProps
    return (
      <html {...this.props} amp={amphtml ? '' : undefined}/>
    )
  }
}

export class Head extends Component<OriginProps> {
  static contextTypes = {
    _documentProps: PropTypes.any,
    _devOnlyInvalidateCacheQueryString: PropTypes.string,
  }

  static propTypes = {
    nonce: PropTypes.string,
    crossOrigin: PropTypes.string,
  }

  context!: DocumentComponentContext

  getCssLinks() {
    const { assetPrefix, files } = this.context._documentProps
    if (!files || files.length === 0) {
      return null
    }

    return files.map((file: string) => {
      // Only render .css files here
      if (!/\.css$/.exec(file)) {
        return null
      }

      return (
        <link
          key={file}
          nonce={this.props.nonce}
          rel="stylesheet"
          href={`${assetPrefix}/_next/${file}`}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
        />
      )
    })
  }

  getPreloadDynamicChunks() {
    const { dynamicImports, assetPrefix } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return dynamicImports.map((bundle: any) => {
      return (
        <link
          rel="preload"
          key={bundle.file}
          href={`${assetPrefix}/_next/${
            bundle.file
          }${_devOnlyInvalidateCacheQueryString}`}
          as="script"
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
        />
      )
    })
  }

  getPreloadMainLinks() {
    const { assetPrefix, files } = this.context._documentProps
    if (!files || files.length === 0) {
      return null
    }
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return files.map((file: string) => {
      // Only render .js files here
      if (!/\.js$/.exec(file)) {
        return null
      }

      return (
        <link
          key={file}
          nonce={this.props.nonce}
          rel="preload"
          href={`${assetPrefix}/_next/${file}${_devOnlyInvalidateCacheQueryString}`}
          as="script"
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
        />
      )
    })
  }

  render() {
    const {
      styles,
      amphtml,
      hasAmp,
      ampPath,
      assetPrefix,
      __NEXT_DATA__,
      dangerousAsPath,
    } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context
    const { page, buildId, dynamicBuildId } = __NEXT_DATA__
    const isDirtyAmp = amphtml && !__NEXT_DATA__.query.amp

    let { head } = this.context._documentProps
    let children = this.props.children
    // show a warning if Head contains <title> (only in development)
    if (process.env.NODE_ENV !== 'production') {
      children = React.Children.map(children, (child: any) => {
        if (child && child.type === 'title') {
          console.warn(
            "Warning: <title> should not be used in _document.js's <Head>. https://err.sh/next.js/no-document-title",
          )
        }
        return child
      })
      if (this.props.crossOrigin)
        console.warn(
          'Warning: `Head` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated',
        )
    }

    // show warning and remove conflicting amp head tags
    head = !amphtml ? head : React.Children.map(head || [], (child) => {
      if (!child) return child
      const { type, props } = child
      let badProp: string = ''

      if (type === 'meta' && props.name === 'viewport') {
        badProp = 'name="viewport"'
      } else if (type === 'link' && props.rel === 'canonical') {
        badProp = 'rel="canonical"'
      } else if (type === 'script') {
        // only block if
        // 1. it has a src and isn't pointing to ampproject's CDN
        // 2. it is using dangerouslySetInnerHTML without a type or
        // a type of text/javascript
        if ((props.src && props.src.indexOf('ampproject') < -1) ||
          (props.dangerouslySetInnerHTML && (!props.type || props.type === 'text/javascript'))
        ) {
          badProp = '<script'
          Object.keys(props).forEach((prop) => {
            badProp += ` ${prop}="${props[prop]}"`
          })
          badProp += '/>'
        }
      }

      if (badProp) {
        console.warn(`Found conflicting amp tag "${child.type}" with conflicting prop ${badProp} in ${__NEXT_DATA__.page}. https://err.sh/next.js/conflicting-amp-tag`)
        return null
      }
      return child
    })

    // try to parse styles from fragment for backwards compat
    const curStyles: React.ReactElement[] = Array.isArray(styles) ? styles : []
    if (amphtml && styles &&
      // @ts-ignore Property 'props' does not exist on type ReactElement
      styles.props && Array.isArray(styles.props.children)
    ) {
      const hasStyles = (el: React.ReactElement) => (
        el && el.props &&
        el.props.dangerouslySetInnerHTML &&
        el.props.dangerouslySetInnerHTML.__html
      )
      // @ts-ignore Property 'props' does not exist on type ReactElement
      styles.props.children.map((child: React.ReactElement) => {
        if (Array.isArray(child)) {
          child.map((el) => hasStyles(el) && curStyles.push(el))
        } else if (hasStyles(child)) {
          curStyles.push(child)
        }
      })
    }

    return (
      <head {...this.props}>
        {children}
        {head}
        {amphtml && (
          <>
            <meta
              name="viewport"
              content="width=device-width,minimum-scale=1,initial-scale=1"
            />
            <link rel="canonical" href={cleanAmpPath(dangerousAsPath)} />
            {isDirtyAmp && <link rel="amphtml" href={getAmpPath(ampPath, dangerousAsPath)} />}
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
        {!amphtml && (
          <>
            {hasAmp && <link rel="amphtml" href={getAmpPath(ampPath, dangerousAsPath)} />}
            {page !== '/_error' && (
              <link
                rel="preload"
                href={
                  assetPrefix +
                  (dynamicBuildId
                    ? `/_next/static/client/pages${getPageFile(page, buildId)}`
                    : `/_next/static/${buildId}/pages${getPageFile(page)}`) +
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
                (dynamicBuildId
                  ? `/_next/static/client/pages/_app.${buildId}.js`
                  : `/_next/static/${buildId}/pages/_app.js`) +
                _devOnlyInvalidateCacheQueryString
              }
              as="script"
              nonce={this.props.nonce}
              crossOrigin={this.props.crossOrigin || process.crossOrigin}
            />
            {this.getPreloadDynamicChunks()}
            {this.getPreloadMainLinks()}
            {this.getCssLinks()}
            {styles || null}
          </>
        )}
      </head>
    )
  }
}

export class Main extends Component {
  static contextTypes = {
    _documentProps: PropTypes.any,
    _devOnlyInvalidateCacheQueryString: PropTypes.string,
  }

  context!: DocumentComponentContext

  render() {
    const { amphtml, html } = this.context._documentProps
    if (amphtml) return '__NEXT_AMP_RENDER_TARGET__'
    return <div id="__next" dangerouslySetInnerHTML={{ __html: html }} />
  }
}

export class NextScript extends Component<OriginProps> {
  static contextTypes = {
    _documentProps: PropTypes.any,
    _devOnlyInvalidateCacheQueryString: PropTypes.string,
  }

  static propTypes = {
    nonce: PropTypes.string,
    crossOrigin: PropTypes.string,
  }

  context!: DocumentComponentContext

  getDynamicChunks() {
    const { dynamicImports, assetPrefix } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

    return dynamicImports.map((bundle: any) => {
      return (
        <script
          async
          key={bundle.file}
          src={`${assetPrefix}/_next/${
            bundle.file
          }${_devOnlyInvalidateCacheQueryString}`}
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
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

    return files.map((file: string) => {
      // Only render .js files here
      if (!/\.js$/.exec(file)) {
        return null
      }

      return (
        <script
          key={file}
          src={`${assetPrefix}/_next/${file}${_devOnlyInvalidateCacheQueryString}`}
          nonce={this.props.nonce}
          async
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
        />
      )
    })
  }

  static getInlineScriptSource(documentProps: DocumentProps) {
    const { __NEXT_DATA__ } = documentProps
    try {
      const data = JSON.stringify(__NEXT_DATA__)
      return htmlEscapeJsonString(data)
    } catch (err) {
      if (err.message.indexOf('circular structure')) {
        throw new Error(
          `Circular structure in "getInitialProps" result of page "${
            __NEXT_DATA__.page
          }". https://err.sh/zeit/next.js/circular-structure`,
        )
      }
      throw err
    }
  }

  render() {
    const {
      staticMarkup,
      assetPrefix,
      amphtml,
      devFiles,
      __NEXT_DATA__,
    } = this.context._documentProps
    const { _devOnlyInvalidateCacheQueryString } = this.context

    if (amphtml) {
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
                  this.context._documentProps,
                ),
              }}
              data-amp-development-mode-only
            />
          )}
          {devFiles
            ? devFiles.map((file) => (
                <script
                  key={file}
                  src={`${assetPrefix}/_next/${file}${_devOnlyInvalidateCacheQueryString}`}
                  nonce={this.props.nonce}
                  crossOrigin={this.props.crossOrigin || process.crossOrigin}
                  data-amp-development-mode-only
                />
              ))
            : null}
        </>
      )
    }

    const { page, buildId, dynamicBuildId } = __NEXT_DATA__

    if (process.env.NODE_ENV !== 'production') {
      if (this.props.crossOrigin)
        console.warn(
          'Warning: `NextScript` attribute `crossOrigin` is deprecated. https://err.sh/next.js/doc-crossorigin-deprecated',
        )
    }

    return (
      <>
        {devFiles
          ? devFiles.map((file: string) => (
              <script
                key={file}
                src={`${assetPrefix}/_next/${file}${_devOnlyInvalidateCacheQueryString}`}
                nonce={this.props.nonce}
                crossOrigin={this.props.crossOrigin || process.crossOrigin}
              />
            ))
          : null}
        {staticMarkup ? null : (
          <script
            id="__NEXT_DATA__"
            type="application/json"
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
            dangerouslySetInnerHTML={{
              __html: NextScript.getInlineScriptSource(
                this.context._documentProps,
              ),
            }}
          />
        )}
        {page !== '/_error' && (
          <script
            async
            id={`__NEXT_PAGE__${page}`}
            src={
              assetPrefix +
              (dynamicBuildId
                ? `/_next/static/client/pages${getPageFile(page, buildId)}`
                : `/_next/static/${buildId}/pages${getPageFile(page)}`) +
              _devOnlyInvalidateCacheQueryString
            }
            nonce={this.props.nonce}
            crossOrigin={this.props.crossOrigin || process.crossOrigin}
          />
        )}
        <script
          async
          id={`__NEXT_PAGE__/_app`}
          src={
            assetPrefix +
            (dynamicBuildId
              ? `/_next/static/client/pages/_app.${buildId}.js`
              : `/_next/static/${buildId}/pages/_app.js`) +
            _devOnlyInvalidateCacheQueryString
          }
          nonce={this.props.nonce}
          crossOrigin={this.props.crossOrigin || process.crossOrigin}
        />
        {staticMarkup ? null : this.getDynamicChunks()}
        {staticMarkup ? null : this.getScripts()}
      </>
    )
  }
}

function getAmpPath(ampPath: string, asPath: string) {
  return ampPath ? ampPath
    : `${asPath}${asPath.includes('?') ? '&' : '?'}amp=1`
}

function getPageFile(page: string, buildId?: string) {
  if (page === '/') {
    return buildId ? `/index.${buildId}.js` : '/index.js'
  }

  return buildId ? `${page}.${buildId}.js` : `${page}.js`
}
