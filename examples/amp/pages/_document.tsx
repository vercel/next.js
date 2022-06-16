import Document, { DocumentContext } from 'next/document'

// Any styles returned in getInitialProps will be combined into one style[amp-custom]
// https://github.com/vercel/next.js/issues/7584#issuecomment-503376412
export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)
    return {
      ...initialProps,
      styles: (
        <>
          {initialProps.styles}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                body {
                    font-family: Roboto, sans-serif;
                    padding: 30px;
                    color: #444;
                }

                h1 {
                    margin-bottom: 5px;
                }

                p {
                    font-size: 18px;
                    line-height: 30px;
                    margin-top: 30px;
                }

                .caption {
                    color: #ccc;
                    margin-top: 0;
                    font-size: 14px;
                    text-align: center;
                }

                .byline {
                    color: green;
                    font-weight: bolder;
                }
            `,
            }}
          />
        </>
      ),
    }
  }
}
