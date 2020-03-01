import Head from 'next/head'

export default () => {
  return (
    <div>
      Hello
      <Head>
        <script
          dangerouslySetInnerHTML={{
            __html: `performance.mark('custom-mark')`,
          }}
        />
      </Head>
    </div>
  )
}
