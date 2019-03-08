/**
 * After the next require you can use process.env to get your secrets
 */
if (process.env.NODE_ENV !== 'production') {
  require('now-env')
}

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
  env: {
    SECRET: process.env.SECRET
  }
}
