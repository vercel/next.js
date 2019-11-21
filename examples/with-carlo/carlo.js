const carlo = require('carlo')

/**
 * ref: https://github.com/GoogleChromeLabs/carlo#usage
 */

module.exports = async url => {
  // Launch the browser.
  const app = await carlo.launch()

  // Terminate Node.js process on app window closing.
  app.on('exit', () => process.exit())

  // Fetch from the next.js server
  app.serveOrigin(url)

  // Expose functions in the web environment.
  await app.exposeFunction('env', _ => process.env)
  await app.exposeFunction('getName', _ => 'next.js')

  // Navigate to the main page of your app.
  await app.load('/')
}
