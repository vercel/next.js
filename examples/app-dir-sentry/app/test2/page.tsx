// "use client";
/**
 * This code will run just fine on the server in Node.js, but process will be
 * undefined in a browser.
 *
 * In dev environment, uncomment the "use client" and it will throw error which
 * will be logged in sentry
 *
 * Note that `isProd = process.env.NODE_ENV` would have
 * worked because Webpack's DefinePlugin will replace it with a string at build
 * time
 */
const env = process.env
const isProd = env.NODE_ENV === 'production'

const Test2 = () => (
  <>
    <h1>Test 2</h1>
    <p>isProd: {isProd ? 'Yes' : 'No'}</p>
  </>
)

export default Test2
