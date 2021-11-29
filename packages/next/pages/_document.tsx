import React, { Component, useContext } from 'react'
import {
  LegacyDocumentContext,
  DocumentInitialProps,
  DocumentProps,
  ModernDocumentContext,
} from '../shared/lib/utils'
import {
  HeadComponentProps,
  HtmlComponentProps,
  MainComponentProps,
  NextScriptComponentProps,
  OriginProps,
} from '../server/document'

export {
  LegacyDocumentContext as DocumentContext,
  DocumentInitialProps,
  DocumentProps,
  OriginProps,
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
  static getInitialProps(
    ctx: LegacyDocumentContext
  ): Promise<DocumentInitialProps> {
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

export function Html(props: HtmlComponentProps) {
  const { Html: HtmlImpl } = useContext(ModernDocumentContext)
  return <HtmlImpl {...props} />
}

export function Head(props: HeadComponentProps) {
  const { Head: HeadImpl } = useContext(ModernDocumentContext)
  return <HeadImpl {...props} />
}

export function Main(props: MainComponentProps) {
  const { Main: MainImpl } = useContext(ModernDocumentContext)
  return <MainImpl {...props} />
}

export function NextScript(props: NextScriptComponentProps) {
  const { NextScript: NextScriptImpl } = useContext(ModernDocumentContext)
  return <NextScriptImpl {...props} />
}
