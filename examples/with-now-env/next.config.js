/**
 * After the next require you can use process.env to get your secrets
 */
require('now-env')

console.log({
  SECRET: process.env.SECRET,
  ANOTHER_SECRET: process.env.ANOTHER_SECRET,
  SECRET_FAIL: process.env.SECRET_FAIL
})

/**
 * If some of the envs are public, like a google maps key, but you still
 * want to keep them secret from the repo, the following code will allow you
 * to share some variables with the client, configured at compile time.
 */
module.exports = {
  webpack: config => {
    config.plugins.forEach(plugin => {
      if (plugin.constructor.name === 'DefinePlugin') {
        plugin.definitions['process.env.SECRET'] = JSON.stringify(process.env.SECRET)
      }
    })

    return config
  }
}
