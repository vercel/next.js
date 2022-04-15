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
        The background of this page is set by &quot;styles/globals.scss&quot; and this
        text size is set by &quot;styles/globals.css&quot;. All global style imports need
        to be done in &quot;.storybook/preview.js&quot; for storybook.
      </main>
    </div>
  )
}
