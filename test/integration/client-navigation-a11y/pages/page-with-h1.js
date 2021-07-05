import Head from 'next/head'

const PageWithH1 = () => (
  <div id="page-with-h1">
    <Head>
      <title>Another Page's Title</title>
    </Head>
    <h1>My heading</h1>
    <div>Extraneous stuff</div>
  </div>
)

export default PageWithH1
