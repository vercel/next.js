import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
} from 'next/document';

interface Props {
  locale: string;
  lang: string;
  nonce: string;
}

class MyDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext) {
    const {req} = ctx;
    const initialProps = await Document.getInitialProps(ctx);
    return {
      ...initialProps,
      locale: (req as any).locale || 'en',
      lang: ((req as any).locale || 'en').split('-')[0],
      nonce: (req as any).nonce,
    };
  }

  render() {
    return (
      <Html lang={this.props.lang}>
        <Head />
        <body>
          <script
            nonce={this.props.nonce}
            dangerouslySetInnerHTML={{
              __html: `window.LOCALE="${this.props.locale}"`,
            }}
          ></script>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
