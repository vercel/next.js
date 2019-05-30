import Head from 'next/head'
import { withAmp } from 'next/amp'

export default withAmp(() => (
  <div>
    <Head>
      <script src='/im-not-allowed.js' type='text/javascript' />
      <script
        dangerouslySetInnerHTML={{
          __html: `console.log("I'm not either :p")`
        }}
      />
    </Head>
    <p>We only allow AMP scripts now</p>
  </div>
))
