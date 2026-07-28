import Document, { type DocumentContext } from 'next/document'

class CustomDocument extends Document {
  // Exercise browserOnly() through the legacy custom Document renderPage path.
  static async getInitialProps(ctx: DocumentContext) {
    return Document.getInitialProps(ctx)
  }
}

export default CustomDocument
