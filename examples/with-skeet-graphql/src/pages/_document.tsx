import Document, { Html, Head, Main, NextScript } from 'next/document'
import siteConfig from '@/config/site'

export default class MyDocument extends Document {
  render() {
    const { locale } = this.props.__NEXT_DATA__.query
    return (
      <Html lang={locale as string}>
        <Head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          <meta name="format-detection" content="telephone=no" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/favicon-16x16.png"
          />
          <link rel="manifest" href="/site.webmanifest" />
          <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#111827" />
          <meta name="msapplication-TileColor" content="#ffffff" />
          <meta name="theme-color" content="#ffffff" />
          {locale === 'ja' ? (
            <meta name="keywords" content={siteConfig.keywordsJA} />
          ) : (
            <meta name="keywords" content={siteConfig.keywordsEN} />
          )}

          <meta property="og:type" content="website" />
          {locale === 'ja' ? (
            <meta property="og:site_name" content={siteConfig.sitenameJA} />
          ) : (
            <meta property="og:site_name" content={siteConfig.sitenameEN} />
          )}
          <meta
            property="og:locale"
            content={locale === 'ja' ? 'ja_JP' : 'en_US'}
          />
          <meta
            httpEquiv="content-language"
            content={locale === 'ja' ? 'ja-jp' : 'en-us'}
          />
          <meta name="twitter:card" content="summary_large_image" />

          <meta name="twitter:creator" content={siteConfig.twitterAccount} />
          <meta
            httpEquiv="Content-Security-Policy"
            content="upgrade-insecure-requests"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
