import React from 'react'

const doAsyncWork = () => Promise.reject(new Error('Server Test 4'))
doAsyncWork()

const Test4 = () => <h1>Server Test 4</h1>

// Define getInitialProps so that the page will be rendered on the server
// instead of statically
Test4.getInitialProps = () => {
  return {}
}

export default Test4
