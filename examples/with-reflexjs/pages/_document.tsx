import NextDocument, { Html, Main, NextScript, Head } from "next/document";
import { InitializeColorMode } from "reflexjs";

export default class Document extends NextDocument {
  render() {
    return (
      <Html lang="en">
        <Head />
        <body>
          <InitializeColorMode />
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
