import { Links } from 'components/Links'
import Head from 'next/head'

export default function StyledJsx() {
  return (
    <div>
      <Head>
        <title>Styled JSX</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Links />
      <style jsx>{`
        .main {
          padding: 4rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .main span {
          color: blue;
        }
      `}</style>
      <main className="main">
        <span>This is styled using Styled JSX</span>
      </main>
    </div>
  )
}
