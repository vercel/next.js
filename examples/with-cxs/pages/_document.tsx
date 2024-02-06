import type { DocumentContext, DocumentInitialProps } from "next/document";
import Document, { Html, Head, Main, NextScript } from "next/document";
import cxs from "cxs";

export default class MyDocument extends Document {
  static async getInitialProps(
    ctx: DocumentContext,
  ): Promise<DocumentInitialProps> {
    const initialProps = await Document.getInitialProps(ctx);
    const styles = cxs.css();
    cxs.reset();

    return {
      ...initialProps,
      styles: (
        <>
          {initialProps.styles}
          <style dangerouslySetInnerHTML={{ __html: styles }} />
        </>
      ),
    };
  }

  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
