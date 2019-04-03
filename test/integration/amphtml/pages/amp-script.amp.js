import Head from 'next/head'

const date = new Date().toJSON()

export default () => (
  <>
    <Head>
      <script
        async
        key='amp-timeago'
        custom-element='amp-timeago'
        src='https://cdn.ampproject.org/v0/amp-timeago-0.1.js'
      />
    </Head>

    <amp-timeago
      width='160'
      height='20'
      datetime={date}
      layout='responsive'
    >
      {date}
    </amp-timeago>
  </>
)
