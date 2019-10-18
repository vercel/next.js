import Document, { Head, Main, NextScript } from "next/document";

import { ServerStyleSheet } from "styled-components";

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const sheet = new ServerStyleSheet();
    const originalRenderPage = ctx.renderPage;

    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp: App => props => sheet.collectStyles(<App {...props} />)
        });

      const initialProps = await Document.getInitialProps(ctx);
      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            {sheet.getStyleElement()}
          </>
        )
      };
    } finally {
      sheet.seal();
    }
  }

  render() {
    return (
      <html lang="en" dir="ltr">
        <Head>
          <meta charSet="utf-8" />
          {/* Use minimum-scale=1 to enable GPU rasterization */}
          <meta
            name="viewport"
            content="initial-scale=0.41, maximum-scale=1, width=device-width, shrink-to-fit=no"
          />
          {/* PWA primary color */}

          <meta
            name="viewport"
            content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no"
          />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css?family=Roboto:400,500|Open+Sans:400,300,600"
          />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/icon?family=Material+Icons"
          />

          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/3.7.0/animate.min.css"
          />
          <script
            async
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
          />

          <script
            dangerouslySetInnerHTML={{
              __html: `
       (adsbygoogle = window.adsbygoogle || []).push({
        google_ad_client: "ca-pub-4777682308285797",
        enable_page_level_ads: true
      });
       `
            }}
          />
        </Head>

        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    );
  }
}
