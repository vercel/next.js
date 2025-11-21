import Document from "next/document";
import { ServerPortal } from "@jesstelford/react-portal-universal/server";

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const portals = new ServerPortal();
    const originalRenderPage = ctx.renderPage;

    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App) => (props) =>
          portals.collectPortals(<App {...props} />),
      });

    const { html, ...props } = await Document.getInitialProps(ctx);

    const htmlWithPortals = portals.appendUniversalPortals(html);

    return {
      html: htmlWithPortals,
      ...props,
    };
  }
}
