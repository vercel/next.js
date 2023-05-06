import Head from 'next/head'

type Props = {
  children: React.ReactNode
}

export const Layout = (props: Props) => (
  <>
    <Head>
      <title>Authsignal Passwordless Example</title>
      <link rel="icon" href="/favicon.ico" />
    </Head>

    {props.children}
  </>
)
