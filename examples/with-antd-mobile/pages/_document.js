import Document, { Head, Main, NextScript } from 'next/document'

// Note that fastclick is here because it is in the antd-mobile docs
// but it may not be required: https://github.com/ant-design/ant-design-mobile/issues/576

export default class extends Document {
  render () {
    return (
      <html>
        <Head>

          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no" />
          <script src="https://as.alipayobjects.com/g/component/fastclick/1.0.6/fastclick.js"></script>

          <style dangerouslySetInnerHTML={{
            __html: `
              if ('addEventListener' in document) {
                document.addEventListener('DOMContentLoaded', function() {
                  FastClick.attach(document.body);
                }, false);
              }
              if(!window.Promise) {
                document.writeln('<script src="https://as.alipayobjects.com/g/component/es6-promise/3.2.2/es6-promise.min.js"'+'>'+'<'+'/'+'script>');
              }
          `,
          }}/>

          <link rel='stylesheet' type='text/css' href='//unpkg.com/antd-mobile/dist/antd-mobile.min.css' />
        </Head>
        <body style={{margin: 0}}>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
