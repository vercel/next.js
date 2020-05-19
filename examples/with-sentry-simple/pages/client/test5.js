import React from 'react'

// This code will run just fine on the server in Node.js, but process will be
// undefined in a browser. Note that `isProd = process.env.NODE_ENV` would have
// worked because Webpack's DefinePlugin will replace it with a string at build
// time: https://nextjs.org/docs#build-time-configuration
const env = process.env
const isProd = env.NODE_ENV === 'production'

const Test5 = () => (
  <React.Fragment>
    <h1>Client Test 5</h1>
    <p>isProd: {isProd}</p>
  </React.Fragment>
)

export default Test5
