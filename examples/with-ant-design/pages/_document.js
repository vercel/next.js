import { promises as fs } from 'fs'
import * as path from 'path'
import Document from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    const css = await fs.readFile(
      path.resolve('./node_modules/antd/dist/antd.min.css'),
      'utf-8'
    )
    return {
      ...initialProps,
      styles: (
        <>
          {initialProps.styles}
          <style dangerouslySetInnerHTML={{ __html: css }} />
        </>
      ),
    }
  }
}

export default MyDocument
