import * as ReactDomServer from 'react-dom/server'

/**
 * @param {Request} req
 */
export default async (_req) => {
  let error = null
  const app = (
    <html>
      <body>
        <h1>Hello, world</h1>
      </body>
    </html>
  )
  const stream = await ReactDomServer.renderToReadableStream(app, {
    onError(err) {
      error = err
    },
  })
  return new Response(error ?? stream)
}

export const config = { runtime: 'experimental-edge' }
