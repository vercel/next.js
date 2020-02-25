
module.exports = {
  webpack: (config, options) => {
    // In `pages/_app.js`, Indent is imported from @indent/node. While
    // @indent/node will run in a browser environment, @indent/browser has
    // smart default for picking up `userId` and user agent context that
    // @indent/node doesn't.
    //
    // Next.js calls this webpack function twice, once for the
    // server and once for the client. Read more:
    // https://nextjs.org/docs#customizing-webpack-config
    //
    // This will ensure you get all the benefits of @indent/browser without
    // breaking the server-side audit trails.
    if (!options.isServer) {
      config.resolve.alias['@indent/node'] = '@indent/browser'
    }

    return config
  },
}