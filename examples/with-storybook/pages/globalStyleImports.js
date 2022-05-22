import { Links } from 'components/Links'
import Head from 'next/head'

export default function CssModules() {
  return (
    <div>
      <Head>
        <title>Global style imports</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Links />
      <main>
        The background of this page is set by "styles/globals.scss" and this
        text size is set by "styles/globals.css". All global style imports need
        to be done in ".storybook/preview.js" for storybook.
      </main>
    </div>
  )
}
