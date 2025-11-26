import Document from "next/document";
import { createStylesheet } from "@filbert-js/server-stylesheet";

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const sheet = createStylesheet();
    const originalRenderPage = ctx.renderPage;
    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp: (App) => {
            return (props) => {
              return sheet.collectStyles(<App {...props} />);
            };
          },
        });
      const initialProps = await Document.getInitialProps(ctx);

      const styleTags = sheet.getReactElements();
      return {
        ...initialProps,
        styles: (
          <>
            {styleTags}
            {initialProps.styles}
          </>
        ),
      };
    } finally {
    }
  }
}

export default MyDocument;
