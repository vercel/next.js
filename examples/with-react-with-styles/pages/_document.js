import Document, { Html, Head, Main, NextScript } from "next/document";
import { StyleSheetServer } from "aphrodite";

class MyDocument extends Document {
  static async getInitialProps({ renderPage }) {
    const { html, css } = StyleSheetServer.renderStatic(() => renderPage());
    const ids = css.renderedClassNames;
    return { ...html, css, ids };
  }

  render() {
    /* Make sure to use data-aphrodite attribute in the style tag here
    so that aphrodite knows which style tag it's in control of when
    the client goes to render styles. If you don't you'll get a second
    <style> tag */
    const { css, ids } = this.props;
    return (
      <Html>
        <Head>
          <style
            data-aphrodite
            dangerouslySetInnerHTML={{ __html: css.content }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
          {ids && (
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.__REHYDRATE_IDS = ${JSON.stringify(ids)}
                `,
              }}
            />
          )}
        </body>
      </Html>
    );
  }
}

export default MyDocument;
