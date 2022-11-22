import Head from 'next/head'
import { AmpIncludeAmpInstallServiceworker } from './amp/AmpCustomElement'

// Your app's theme color
const THEME_COLOR = '#005af0'

type LayoutProps = {
  title: string
  children?: React.ReactNode
  description: string
}

/**
 * A sample page layout installing the AMP Serviceworker by default.
 */
const Layout: React.FC<LayoutProps> = ({ title, children, description }) => (
  <>
    <Head>
      <title>{title || ''}</title>
      <meta name="description" content={description || ''} />
      <meta name="theme-color" content={THEME_COLOR} />
      <link rel="icon" sizes="192x192" href="/static/images/icons-192.png" />
      <link rel="apple-touch-icon" href="/static/images/icons-192.png" />
      <link rel="icon" href="/static/favicon.ico" />
      <link rel="manifest" href="/manifest.json" />
    </Head>

    {children}

    <AmpIncludeAmpInstallServiceworker />
    <amp-install-serviceworker
      src="/serviceworker.js"
      data-iframe-src="/install-serviceworker.html"
      layout="nodisplay"
    />

    <style jsx global>{`
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
          Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
          'Segoe UI Symbol';
        min-height: 100vh;
        scroll-behavior: smooth;
        text-rendering: optimizeSpeed;
        line-height: 1.5;
      }
    `}</style>
  </>
)

export default Layout
