import { extractCss } from "goober";
import NextDocument, {
  DocumentContext,
  Head,
  Html,
  Main,
  NextScript,
} from "next/document";

type Props = {
  css: string;
};

class Document extends NextDocument<Props> {
  static async getInitialProps({ renderPage }: DocumentContext) {
    const page = await renderPage();
    const css = extractCss();
    return { ...page, css };
  }

  render() {
    return (
      <Html>
        <Head>
          <style
            id={"_goober"}
            // And defined it in here
            dangerouslySetInnerHTML={{ __html: " " + this.props.css }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default Document;
