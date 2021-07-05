import Head from 'next/head'

const MarkInHead = () => {
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

export default MarkInHead
