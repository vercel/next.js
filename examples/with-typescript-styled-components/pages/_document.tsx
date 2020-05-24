import React from 'react';
import Document, { DocumentContext, DocumentInitialProps } from 'next/document';
import { RenderPageResult } from 'next/dist/next-server/lib/utils';

import { ServerStyleSheet } from 'styled-components';

export default class MyDocument extends Document<DocumentInitialProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<DocumentInitialProps> {
    const sheet = new ServerStyleSheet();
    const originalRenderPage = ctx.renderPage;

    try {
      ctx.renderPage = (): RenderPageResult | Promise<RenderPageResult> => originalRenderPage({
        enhanceApp: (App) => (
          props,
        ): React.ReactElement<{ sheet: ServerStyleSheet }> => sheet.collectStyles(
          // eslint-disable-next-line react/jsx-props-no-spreading
          <App {...props} />,
        ),
      });

      const initialProps = await Document.getInitialProps(ctx);
      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            {sheet.getStyleElement()}
          </>
        ),
      };
    } finally {
      sheet.seal();
    }
  }
}
