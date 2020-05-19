import React from 'react'

const Test1 = () => <h1>Server Test 1</h1>

Test1.getInitialProps = () => {
  throw new Error('Server Test 1')
}

export default Test1
