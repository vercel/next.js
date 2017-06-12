const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  webpack (config, { dev }) {
    // config the webpack target to be electron-renderer
    // this allow us to import electron renderer modules in your next.js pages
    config.target = 'electron-renderer'

    return config
  },
  exportPathMap () {
    // export our pages as HTML for production usage
    return {
      '/': { page: '/' }
    }
  },
  // set the prefix as `./` instead of `/`, this is because when you export your pages
  // Next.js will try to import the JS files as `/` instead of the full path
  assetPrefix: isProd ? 'next:///' : '/'
}
