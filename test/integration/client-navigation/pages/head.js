import React from 'react'
import Head from 'next/head'

export default () => <div>
  <Head>
    {/* this will not render */}
    <meta charSet='utf-8' />
    {/* this will get rendered */}
    <meta charSet='iso-8859-5' />

    {/* this not render */}
    <meta name='viewport' content='width=device-width' />
    {/* this will override the default */}
    <meta name='viewport' content='width=device-width,initial-scale=1' />

    <meta content='my meta' />

    {/* allow duplicates for specific tags */}
    <meta property='article:tag' content='tag1' key='tag1key' />
    <meta property='article:tag' content='tag2' key='tag2key' />
    <meta property='dedupe:tag' content='tag3' key='same-key' />
    <meta property='dedupe:tag' content='tag4' key='same-key' />
    <meta property='og:image' content='ogImageTag1' key='ogImageTag1Key' />
    <meta property='og:image' content='ogImageTag2' key='ogImageTag2Key' />
    <meta property='og:image:alt' content='ogImageAltTag1' key='ogImageAltTag1Key' />
    <meta property='og:image:alt' content='ogImageAltTag2' key='ogImageAltTag2Key' />
    <meta property='og:image:width' content='ogImageWidthTag1' key='ogImageWidthTag1Key' />
    <meta property='og:image:width' content='ogImageWidthTag2' key='ogImageWidthTag2Key' />
    <meta property='og:image:height' content='ogImageHeightTag1' key='ogImageHeightTag1Key' />
    <meta property='og:image:height' content='ogImageHeightTag2' key='ogImageHeightTag2Key' />
    <meta property='og:image:type' content='ogImageTypeTag1' key='ogImageTypeTag1Key' />
    <meta property='og:image:type' content='ogImageTypeTag2' key='ogImageTypeTag2Key' />
    <meta property='og:image:secure_url' content='ogImageSecureUrlTag1' key='ogImageSecureUrlTag1Key' />
    <meta property='og:image:secure_url' content='ogImageSecureUrlTag2' key='ogImageSecureUrlTag2Key' />
    <meta property='og:image:url' content='ogImageUrlTag1' key='ogImageUrlTag1Key' />
    <meta property='og:image:url' content='ogImageUrlTag2' key='ogImageUrlTag2Key' />

    <meta property='fb:pages' content='fbpages1' />
    <meta property='fb:pages' content='fbpages2' />

    <React.Fragment>
      <title>Fragment title</title>
      <meta content='meta fragment' />
    </React.Fragment>

    {/* the following 2 links tag will be rendered both */}
    <link rel='stylesheet' href='/dup-style.css' />
    <link rel='stylesheet' href='/dup-style.css' />

    {/* only one tag will be rendered as they have the same key */}
    <link rel='stylesheet' href='dedupe-style.css' key='my-style' />
    <link rel='stylesheet' href='dedupe-style.css' key='my-style' />
  </Head>
  <h1>I can have meta tags</h1>
</div>
