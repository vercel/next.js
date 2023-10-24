import Head from 'next/head'

export const config = { amp: true }

const Comp = () => (
  <>
    <Head>
      <title>The Cat</title>
      <style
        amp-custom=""
        dangerouslySetInnerHTML={{
          __html: `body { color: #fff; }`,
        }}
      />
      <style amp-custom="">{`amp-img { border-radius: 16px; }`}</style>
    </Head>
    <div>
      <p>Hello world!</p>
      <style jsx>{`
        p {
          font-size: 16.4px;
        }
      `}</style>
    </div>
  </>
)

Comp.getInitialProps = () => ({})
export default Comp
