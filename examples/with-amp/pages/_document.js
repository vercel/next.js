import Document, { Head } from 'next/document'
import { DOMProperty } from 'react-dom/../lib/ReactInjection'

DOMProperty.injectDOMPropertyConfig({
  Properties: { amp: DOMProperty.MUST_USE_ATTRIBUTE },
  isCustomAttribute: attributeName => attributeName.startsWith('amp-')
})

export default class MyDocument extends Document {
  render () {
    const { html } = this.props
    return (
      <html amp=''>
        <Head>
          <meta charset='utf-8' />
          <link rel='canonical' href='/' />
          <meta name='viewport' content='width=device-width,minimum-scale=1' />
          <style amp-boilerplate=''>{`body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}`}</style><noscript><style amp-boilerplate=''>{`body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}`}</style></noscript>
          <script async src='https://cdn.ampproject.org/v0.js' />
        </Head>
        <body>
          <div id='__next' dangerouslySetInnerHTML={{ __html: html }} />
        </body>
      </html>
    )
  }
}
