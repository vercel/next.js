import { Links } from 'components/Links'
import { MyComponent } from 'components/MyComponent'
import Head from 'next/head'

export default function AbsoluteImports() {
  return (
    <div>
      <Head>
        <title>Absolute Imports</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Links />
      <main>
        This uses an absolute import:{' '}
        <MyComponent>Im absolutely imported</MyComponent>
      </main>
    </div>
  )
}
