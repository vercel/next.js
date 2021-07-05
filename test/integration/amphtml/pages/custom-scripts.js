import Head from 'next/head'

export const config = { amp: true }

const CustomScripts = () => (
  <div>
    <Head>
      <script src="/im-not-allowed.js" type="text/javascript" />
      <script
        dangerouslySetInnerHTML={{
          __html: `console.log("I'm not either :p")`,
        }}
      />
    </Head>
    <p>We only allow AMP scripts now</p>
  </div>
)

export default CustomScripts
