import { createDOMRenderer, renderToStyleElements } from '@fluentui/react-components';
import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
  DocumentInitialProps,
} from 'next/document'

export default function MyDocument() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}



MyDocument.getInitialProps = async (
  ctx: DocumentContext
): Promise<DocumentInitialProps> => {
  const renderer = createDOMRenderer();
  const originalRenderPage = ctx.renderPage;

    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: App =>
          function EnhancedApp(props) {
            const enhancedProps = {
              ...props,
              // 👇 this is required to provide a proper renderer instance
              renderer,
            };

            return <App {...enhancedProps} />;
          },
      });

    const initialProps = await Document.getInitialProps(ctx);
    const styles = renderToStyleElements(renderer);

    return {
      ...initialProps,
      styles: (
        <>
          {initialProps.styles}
          {/* 👇 adding Fluent UI styles elements to output */}
          {styles}
        </>
      ),
    };
}